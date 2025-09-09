import {asDefined, Exec, isDefined, MutableObservableValue, Option, panic, unitValue, UUID} from "@opendaw/lib-std"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {SampleLoader} from "@opendaw/studio-adapters"
import {Project} from "./Project"
import {ProjectEnv} from "./ProjectEnv"
import {ProjectPaths} from "./ProjectPaths"
import {ProjectProfile} from "./ProjectProfile"
import {WorkerAgents} from "../WorkerAgents"
import {SampleStorage} from "../samples/SampleStorage"
import {MainThreadSampleLoader} from "../samples/MainThreadSampleLoader"
import type JSZip from "jszip"

export namespace ProjectBundle {
    export const encode = async ({uuid, project, meta, cover}: ProjectProfile,
                                 progress: MutableObservableValue<unitValue>): Promise<ArrayBuffer> => {
        const {default: JSZip} = await import("jszip")
        const zip = new JSZip()
        zip.file("version", "1")
        zip.file("uuid", uuid, {binary: true})
        zip.file(ProjectPaths.ProjectFile, project.toArrayBuffer() as ArrayBuffer, {binary: true})
        zip.file(ProjectPaths.ProjectMetaFile, JSON.stringify(meta, null, 2))
        cover.ifSome(buffer => zip.file(ProjectPaths.ProjectCoverFile, buffer, {binary: true}))
        const samples = asDefined(zip.folder("samples"), "Could not create folder samples")
        const boxes = project.boxGraph.boxes().filter(box => box instanceof AudioFileBox)
        let boxIndex = 0
        const blob = await Promise.all(boxes
            .map(async ({address: {uuid}}) => {
                const handler: SampleLoader = project.sampleManager.getOrCreate(uuid) as MainThreadSampleLoader
                const folder = asDefined(samples.folder(UUID.toString(uuid)), "Could not create folder for sample")
                return pipeSampleLoaderInto(handler, folder).then(() => progress.setValue(++boxIndex / boxes.length * 0.75))
            })).then(() => zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {level: 6}
        }))
        progress.setValue(1.0)
        return blob.arrayBuffer()
    }

    export const decode = async (env: ProjectEnv,
                                 arrayBuffer: ArrayBuffer,
                                 openProfileUUID?: UUID.Bytes): Promise<ProjectProfile> => {
        const {default: JSZip} = await import("jszip")
        const zip = await JSZip.loadAsync(arrayBuffer)
        if (await asDefined(zip.file("version")).async("text") !== "1") {
            return panic("Unknown bundle version")
        }
        const bundleUUID = UUID.validate(await asDefined(zip.file("uuid")).async("uint8array"))
        console.debug(UUID.toString(bundleUUID), openProfileUUID ? UUID.toString(openProfileUUID) : "none")
        if (isDefined(openProfileUUID) && UUID.equals(openProfileUUID, bundleUUID)) {
            return panic("Project is already open")
        }
        console.debug("loading samples...")
        const samples = asDefined(zip.folder("samples"), "Could not find samples")
        const promises: Array<Promise<void>> = []
        samples.forEach((path, file) => {
            if (file.dir) {return}
            promises.push(file.async("arraybuffer")
                .then(arrayBuffer => WorkerAgents.Opfs
                    .write(`${SampleStorage.Folder}/${path}`, new Uint8Array(arrayBuffer))))
        })
        await Promise.all(promises)
        const project = Project.load(env, await asDefined(zip.file(ProjectPaths.ProjectFile)).async("arraybuffer"))
        const meta = JSON.parse(await asDefined(zip.file(ProjectPaths.ProjectMetaFile)).async("text"))
        const coverFile = zip.file(ProjectPaths.ProjectCoverFile)
        const cover: Option<ArrayBuffer> = Option.wrap(await coverFile?.async("arraybuffer"))
        return new ProjectProfile(bundleUUID, project, meta, cover)
    }

    const pipeSampleLoaderInto = async (loader: SampleLoader, zip: JSZip): Promise<void> => {
        const exec: Exec = async () => {
            const path = `${SampleStorage.Folder}/${UUID.toString(loader.uuid)}`
            zip.file("audio.wav", await WorkerAgents.Opfs.read(`${path}/audio.wav`), {binary: true})
            zip.file("peaks.bin", await WorkerAgents.Opfs.read(`${path}/peaks.bin`), {binary: true})
            zip.file("meta.json", await WorkerAgents.Opfs.read(`${path}/meta.json`))
        }
        if (loader.state.type === "loaded") {
            return exec()
        } else {
            return new Promise<void>((resolve, reject) => {
                const subscription = loader.subscribe(state => {
                    if (state.type === "loaded") {
                        resolve()
                        subscription.terminate()
                    } else if (state.type === "error") {
                        reject(state.reason)
                        subscription.terminate()
                    }
                })
            }).then(() => exec())
        }
    }
}