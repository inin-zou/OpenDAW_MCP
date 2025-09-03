import {
    asDefined,
    EmptyExec,
    isDefined,
    MutableObservableValue,
    Option,
    tryCatch,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {MainThreadSampleLoader, Project, SampleStorage, WorkerAgents} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService"
import {ProjectMeta} from "@/project/ProjectMeta"
import {ProjectProfile} from "@/project/ProjectProfile"
import {ProjectDecoder} from "@opendaw/studio-adapters"
import {SampleUtils} from "@/project/SampleUtils"
import type JSZip from "jszip"

export namespace ProjectPaths {
    export const Folder = "projects/v1"
    export const ProjectFile = "project.od"
    export const ProjectMetaFile = "meta.json"
    export const ProjectCoverFile = "image.bin"
    export const projectFile = (uuid: UUID.Format): string => `${(projectFolder(uuid))}/${ProjectFile}`
    export const projectMeta = (uuid: UUID.Format): string => `${(projectFolder(uuid))}/${ProjectMetaFile}`
    export const projectCover = (uuid: UUID.Format): string => `${(projectFolder(uuid))}/${ProjectCoverFile}`
    export const projectFolder = (uuid: UUID.Format): string => `${Folder}/${UUID.toString(uuid)}`
}

export namespace Projects {
    export const saveProject = async ({uuid, project, meta, cover}: ProjectProfile): Promise<void> => {
        return Promise.all([
            WorkerAgents.Opfs.write(ProjectPaths.projectFile(uuid), new Uint8Array(project.toArrayBuffer())),
            WorkerAgents.Opfs.write(ProjectPaths.projectMeta(uuid), new TextEncoder().encode(JSON.stringify(meta))),
            cover.match({
                none: () => Promise.resolve(),
                some: x => WorkerAgents.Opfs.write(ProjectPaths.projectCover(uuid), new Uint8Array(x))
            })
        ]).then(EmptyExec)
    }

    export const loadCover = async (uuid: UUID.Format): Promise<Option<ArrayBuffer>> => {
        return WorkerAgents.Opfs.read(ProjectPaths.projectCover(uuid))
            .then(array => Option.wrap(array.buffer as ArrayBuffer), () => Option.None)
    }

    export const loadProject = async (service: StudioService, uuid: UUID.Format): Promise<Project> => {
        return WorkerAgents.Opfs.read(ProjectPaths.projectFile(uuid))
            .then(async array => {
                const arrayBuffer = array.buffer as ArrayBuffer
                const project = Project.load(service, arrayBuffer)
                await SampleUtils.verify(project.boxGraph, service, service.sampleManager)
                return project
            })
    }

    export const listProjects = async (): Promise<ReadonlyArray<{ uuid: UUID.Format, meta: ProjectMeta }>> => {
        return WorkerAgents.Opfs.list(ProjectPaths.Folder)
            .then(files => Promise.all(files.filter(file => file.kind === "directory")
                .map(async ({name}) => {
                    const uuid = UUID.parse(name)
                    const array = await WorkerAgents.Opfs.read(ProjectPaths.projectMeta(uuid))
                    return ({uuid, meta: JSON.parse(new TextDecoder().decode(array)) as ProjectMeta})
                })))
    }

    export const listUsedSamples = async (): Promise<Set<string>> => {
        const uuids: Array<string> = []
        const files = await WorkerAgents.Opfs.list(ProjectPaths.Folder)
        for (const {name} of files.filter(file => file.kind === "directory")) {
            const array = await WorkerAgents.Opfs.read(ProjectPaths.projectFile(UUID.parse(name)))
            tryCatch(() => {
                const {boxGraph} = ProjectDecoder.decode(array.buffer)
                uuids.push(...boxGraph.boxes()
                    .filter(box => box instanceof AudioFileBox)
                    .map((box) => UUID.toString(box.address.uuid)))
            })
        }
        return new Set<string>(uuids)
    }

    export const deleteProject = async (uuid: UUID.Format) => WorkerAgents.Opfs.delete(ProjectPaths.projectFolder(uuid))

    export const exportBundle = async ({uuid, project, meta, cover}: ProjectProfile,
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
                const handler: MainThreadSampleLoader = project.sampleManager.getOrCreate(uuid) as MainThreadSampleLoader // TODO get rid of cast
                const folder: JSZip = asDefined(samples.folder(UUID.toString(uuid)), "Could not create folder for sample")
                return handler.pipeFilesInto(folder).then(() => progress.setValue(++boxIndex / boxes.length * 0.75))
            })).then(() => zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {level: 6}
        }))
        progress.setValue(1.0)
        return blob.arrayBuffer()
    }

    export const importBundle = async (service: StudioService, arrayBuffer: ArrayBuffer): Promise<ProjectProfile> => {
        const {default: JSZip} = await import("jszip")
        const zip = await JSZip.loadAsync(arrayBuffer)
        if (await asDefined(zip.file("version")).async("text") !== "1") {throw "Unknown bundle version"}
        const uuid = UUID.validate(await asDefined(zip.file("uuid")).async("uint8array"))
        const optSession = service.sessionService.getValue()
        if (optSession.nonEmpty() && UUID.equals(optSession.unwrap().uuid, uuid)) {return Promise.reject("Project is already open")}
        console.debug("loading samples...")
        const samples = asDefined(zip.folder("samples"), "Could not find samples")
        const promises: Array<Promise<void>> = []
        samples.forEach((path, file) => {
            if (!file.dir) {
                promises.push(file
                    .async("arraybuffer")
                    .then(arrayBuffer => WorkerAgents.Opfs.write(`${SampleStorage.Folder}/${path}`, new Uint8Array(arrayBuffer))))
            }
        })
        await Promise.all(promises)
        const project = Project.load(service, await asDefined(zip.file(ProjectPaths.ProjectFile)).async("arraybuffer"))
        const meta = JSON.parse(await asDefined(zip.file(ProjectPaths.ProjectMetaFile)).async("text"))
        const coverFile = zip.file(ProjectPaths.ProjectCoverFile)
        const cover: Option<ArrayBuffer> = isDefined(coverFile)
            ? Option.wrap(await coverFile.async("arraybuffer"))
            : Option.None
        return new ProjectProfile(UUID.generate(), project, meta, cover)
    }
}