import {Option, tryCatch, UUID} from "@opendaw/lib-std"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {Project, ProjectMeta, ProjectPaths, WorkerAgents} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService"
import {ProjectDecoder} from "@opendaw/studio-adapters"
import {SampleUtils} from "@/project/SampleUtils"

export namespace Projects {
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
}