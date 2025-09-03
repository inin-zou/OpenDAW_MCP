import {ProjectProfile} from "@/project/ProjectProfile"
import {asDefined, isDefined, MutableObservableValue, Option, panic, unitValue, UUID} from "@opendaw/lib-std"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {MainThreadSampleLoader, Project, ProjectEnv, SampleStorage, WorkerAgents} from "@opendaw/studio-core"
import {ProjectPaths} from "@/project/ProjectPaths"

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
                // TODO get rid of cast. pipeFilesInto needs to be somewhere else.
                const handler: MainThreadSampleLoader = project.sampleManager.getOrCreate(uuid) as MainThreadSampleLoader
                const folder = asDefined(samples.folder(UUID.toString(uuid)), "Could not create folder for sample")
                return handler.pipeFilesInto(folder).then(() => progress.setValue(++boxIndex / boxes.length * 0.75))
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
                                 exclude?: UUID.Format): Promise<ProjectProfile> => {
        const {default: JSZip} = await import("jszip")
        const zip = await JSZip.loadAsync(arrayBuffer)
        if (await asDefined(zip.file("version")).async("text") !== "1") {
            return panic("Unknown bundle version")
        }
        const bundleUUID = UUID.validate(await asDefined(zip.file("uuid")).async("uint8array"))
        console.debug(UUID.toString(bundleUUID), exclude ? UUID.toString(exclude) : "none")
        if (isDefined(exclude) && UUID.equals(exclude, bundleUUID)) {
            return panic("Project is already open")
        }
        console.debug("loading samples...")
        const samples = asDefined(zip.folder("samples"), "Could not find samples")
        const promises: Array<Promise<void>> = []
        samples.forEach((path, file) => {
            if (!file.dir) {
                promises.push(file
                    .async("arraybuffer")
                    .then(arrayBuffer => WorkerAgents.Opfs
                        .write(`${SampleStorage.Folder}/${path}`, new Uint8Array(arrayBuffer))))
            }
        })
        await Promise.all(promises)
        const project = Project.load(env, await asDefined(zip.file(ProjectPaths.ProjectFile)).async("arraybuffer"))
        const meta = JSON.parse(await asDefined(zip.file(ProjectPaths.ProjectMetaFile)).async("text"))
        const coverFile = zip.file(ProjectPaths.ProjectCoverFile)
        const cover: Option<ArrayBuffer> = isDefined(coverFile)
            ? Option.wrap(await coverFile.async("arraybuffer"))
            : Option.None
        return new ProjectProfile(bundleUUID, project, meta, cover)
    }
}