import {Option, Progress, safeExecute, tryCatch, UUID} from "@opendaw/lib-std"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {ProjectDecoder} from "@opendaw/studio-adapters"
import {Promises} from "@opendaw/lib-runtime"
import {ProjectMeta} from "./ProjectMeta"
import {WorkerAgents} from "../WorkerAgents"
import {ProjectPaths} from "./ProjectPaths"

export namespace ProjectStorage {
    export type ListEntry = {
        uuid: UUID.Format
        meta: ProjectMeta
        cover?: ArrayBuffer
        project?: ArrayBuffer
    }

    export type List = ReadonlyArray<ListEntry>

    export const listProjects = async ({includeCover, includeProject, progress}: {
        includeCover?: boolean
        includeProject?: boolean
        progress?: Progress.Handler
    } = {}): Promise<List> => {
        return WorkerAgents.Opfs.list(ProjectPaths.Folder)
            .then(files => Promise.all(files.filter(file => file.kind === "directory")
                .map(async ({name}, index, {length}) => {
                    safeExecute(progress, (index + 1) / length)
                    const uuid = UUID.parse(name)
                    const array = await WorkerAgents.Opfs.read(ProjectPaths.projectMeta(uuid))
                    return ({
                        uuid,
                        meta: JSON.parse(new TextDecoder().decode(array)) as ProjectMeta,
                        cover: includeCover ? (await loadCover(uuid)).unwrapOrUndefined() : undefined,
                        project: includeProject ? await loadProject(uuid) : undefined
                    } satisfies ListEntry)
                })))
    }

    export const loadProject = async (uuid: UUID.Format): Promise<ArrayBuffer> => {
        return WorkerAgents.Opfs.read(ProjectPaths.projectFile(uuid)).then(array => array.buffer as ArrayBuffer)
    }

    export const loadCover = async (uuid: UUID.Format): Promise<Option<ArrayBuffer>> => {
        return WorkerAgents.Opfs.read(ProjectPaths.projectCover(uuid))
            .then(array => Option.wrap(array.buffer as ArrayBuffer), () => Option.None)
    }

    export const listUsedSamples = async (): Promise<Set<string>> => {
        const uuids: Array<string> = []
        const files = await WorkerAgents.Opfs.list(ProjectPaths.Folder)
        for (const {name} of files.filter(file => file.kind === "directory")) {
            const result = await WorkerAgents.Opfs.read(ProjectPaths.projectFile(UUID.parse(name)))
            tryCatch(() => {
                const {boxGraph} = ProjectDecoder.decode(result.buffer)
                uuids.push(...boxGraph.boxes()
                    .filter(box => box instanceof AudioFileBox)
                    .map((box) => UUID.toString(box.address.uuid)))
            })
        }
        return new Set<string>(uuids)
    }

    export const deleteProject = async (uuid: UUID.Format) => {
        const {status, value} = await Promises.tryCatch(WorkerAgents.Opfs.read(`${ProjectPaths.Folder}/trash.json`))
        const array = status === "rejected" ? [] : JSON.parse(new TextDecoder().decode(value))
        array.push(UUID.toString(uuid))
        const trash = new TextEncoder().encode(JSON.stringify(array))
        await WorkerAgents.Opfs.write(`${ProjectPaths.Folder}/trash.json`, trash)
        await WorkerAgents.Opfs.delete(ProjectPaths.projectFolder(uuid))
    }
}