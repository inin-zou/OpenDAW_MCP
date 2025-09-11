import {
    Arrays,
    EmptyExec,
    Errors,
    isInstanceOf,
    isUndefined,
    Nullish,
    Objects,
    Option,
    panic,
    Procedure,
    Progress,
    RuntimeNotifier,
    TimeSpan,
    UUID
} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {ProjectMeta} from "../project/ProjectMeta"
import {ProjectStorage} from "../project/ProjectStorage"
import {CloudStorageHandler} from "./CloudStorageHandler"
import {WorkerAgents} from "../WorkerAgents"
import {ProjectPaths} from "../project/ProjectPaths"

// these get indexed in the cloud with the uuid in the cloud's catalog
const catalogFields = ["name", "modified", "created", "tags", "description"] as const

type CatalogFields = typeof catalogFields[number]
type MetaFields = Pick<ProjectMeta, CatalogFields>
type Projects = Record<UUID.String, MetaFields>
type ProjectDomains = Record<"local" | "cloud", Projects>

// TODO List project folder to see if cover exists (less errors in console)

export class CloudSyncProjects {
    static readonly RemotePath = "projects"
    static readonly RemoteCatalogPath = `${this.RemotePath}/index.json`

    static async start(cloudHandler: CloudStorageHandler,
                       progress: Progress.Handler,
                       log: Procedure<string>) {
        log("Collecting all project domains...")
        const [local, cloud] = await Promise.all([
            ProjectStorage.listProjects()
                .then(list => list.reduce((record: Projects, entry: ProjectStorage.ListEntry) => {
                    record[UUID.toString(entry.uuid)] = Objects.include(entry.meta, ...catalogFields)
                    return record
                }, {})),
            cloudHandler.download(CloudSyncProjects.RemoteCatalogPath)
                .then(json => JSON.parse(new TextDecoder().decode(json)))
                .catch(reason => reason instanceof Errors.FileNotFound ? Arrays.empty() : panic(reason))
        ])
        return new CloudSyncProjects(cloudHandler, {local, cloud}, log).#start(progress)
    }

    readonly #cloudHandler: CloudStorageHandler
    readonly #projectDomains: ProjectDomains
    readonly #log: Procedure<string>

    private constructor(cloudHandler: CloudStorageHandler, projectDomains: ProjectDomains, log: Procedure<string>) {
        this.#cloudHandler = cloudHandler
        this.#projectDomains = projectDomains
        this.#log = log
    }

    async #start(progress: Progress.Handler) {
        const trashed = await ProjectStorage.loadTrashedIds()
        const [uploadProgress, trashProgress, downloadProgress] = Progress.splitWithWeights(progress, [0.45, 0.10, 0.45])
        await this.#upload(uploadProgress)
        await this.#trash(trashed, trashProgress)
        await this.#download(trashed, downloadProgress)
    }

    async #upload(progress: Progress.Handler) {
        const {local, cloud} = this.#projectDomains
        const isUnsynced = (localProject: MetaFields, cloudProject: Nullish<MetaFields>) =>
            isUndefined(cloudProject) || new Date(cloudProject.modified).getTime() < new Date(localProject.modified).getTime()
        const unsyncedProjects: ReadonlyArray<[string, MetaFields]> = Object.entries(local)
            .filter(([uuid, localProject]) => isUnsynced(localProject, cloud[uuid as UUID.String]))
        if (unsyncedProjects.length === 0) {
            this.#log("No unsynced projects found.")
            progress(1.0)
            return
        }
        const results = await Promises.allSettledWithLimit(unsyncedProjects
            .map(([uuidAsString, meta]: [string, MetaFields], index, {length}) => async () => {
                progress((index + 1) / length)
                this.#log(`Uploading project '${meta.name}'`)
                const uuid = UUID.parse(uuidAsString)
                const folder = `${CloudSyncProjects.RemotePath}/${uuidAsString}`
                const metaJson = new TextEncoder().encode(JSON.stringify(meta)).buffer
                const project = await ProjectStorage.loadProject(uuid)
                const optCover = await ProjectStorage.loadCover(uuid)
                const tasks: Array<Promise<void>> = []
                tasks.push(this.#cloudHandler.upload(`${folder}/project.od`, project))
                tasks.push(this.#cloudHandler.upload(`${folder}/meta.json`, metaJson))
                optCover.ifSome(cover => tasks.push(this.#cloudHandler.upload(`${folder}/image.bin`, cover)))
                await Promises.timeout(Promise.all(tasks), TimeSpan.seconds(30), "Upload timeout (30s).")
                return {uuidAsString, meta}
            }), 1)
        const uploaded = results
            .filter(result => result.status === "fulfilled")
            .reduce((projects, {value: project}) => {
                projects[UUID.asString(project.uuidAsString)] = project.meta
                return projects
            }, {...cloud})
        await this.#uploadCatalog(uploaded)
        progress(1.0)
    }

    async #trash(trashed: ReadonlyArray<UUID.String>, progress: Progress.Handler) {
        const {cloud} = this.#projectDomains
        const obsolete: Array<[string, MetaFields]> = Arrays.intersect(Object.entries(cloud), trashed, ([uuid, _], trashed) => uuid === trashed)
        if (obsolete.length > 0) {
            const approved = await RuntimeNotifier.approve({
                headline: "Delete Projects?",
                message: `Found ${obsolete.length} locally deleted projects. Delete from cloud as well?`,
                approveText: "Yes",
                cancelText: "No"
            })
            if (approved) {
                const result: ReadonlyArray<PromiseSettledResult<UUID.String>> = await Promises.allSettledWithLimit(
                    obsolete.map(([uuid, meta], index, {length}) => async () => {
                        progress((index + 1) / length)
                        const path = `${CloudSyncProjects.RemotePath}/${uuid}`
                        this.#log(`Deleting '${meta.name}'`)
                        await this.#cloudHandler.delete(path)
                        return UUID.asString(uuid)
                    }), 1)
                const catalog = {...cloud}
                result
                    .filter(result => result.status === "fulfilled")
                    .forEach(({value: uuid}) => delete catalog[uuid])
                await this.#uploadCatalog(catalog)
            }
        }
        progress(1.0)
    }

    async #download(trashed: ReadonlyArray<UUID.String>, progress: Progress.Handler) {
        const {cloud, local} = this.#projectDomains
        const compareFn = ([uuidA]: [string, MetaFields], [uuidB]: [string, MetaFields]) => uuidA === uuidB
        const missingLocally = Arrays.subtract(Object.entries(cloud), Object.entries(local), compareFn)
        const download = Arrays.subtract(missingLocally, trashed, ([projectUUID], uuid) => projectUUID === uuid)
        if (download.length === 0) {
            this.#log("No projects to download.")
            progress(1.0)
            return
        }
        const results: ReadonlyArray<PromiseSettledResult<string>> = await Promises.allSettledWithLimit(
            download.map(([uuidAsString, meta], index, {length}) => async () => {
                progress((index + 1) / length)
                const uuid = UUID.parse(uuidAsString)
                const path = `${CloudSyncProjects.RemotePath}/${uuidAsString}`
                this.#log(`Downloading '${meta.name}'`)
                const projectArrayBuffer = await this.#cloudHandler.download(`${path}/project.od`)
                const metaArrayBuffer = await this.#cloudHandler.download(`${path}/meta.json`)
                const coverArrayBuffer = await this.#cloudHandler.download(`${path}/image.bin`)
                    .then(arrayBuffer => Option.wrap(arrayBuffer))
                    .catch(error => isInstanceOf(error, Errors.FileNotFound) ? Option.None : panic(error))
                Promise.all([
                    WorkerAgents.Opfs.write(ProjectPaths.projectFile(uuid), new Uint8Array(projectArrayBuffer)),
                    WorkerAgents.Opfs.write(ProjectPaths.projectMeta(uuid), new Uint8Array(metaArrayBuffer)),
                    coverArrayBuffer.match({
                        none: () => Promise.resolve(),
                        some: arrayBuffer => WorkerAgents.Opfs.write(ProjectPaths.projectCover(uuid), new Uint8Array(arrayBuffer))
                    })
                ]).then(EmptyExec)
                return uuidAsString
            }), 1)
        const failure = results.filter(result => result.status === "rejected")
        if (failure.length > 0) {
            this.#log(`Some projects could not be downloaded (${failure[0].reason})`)
        } else {
            this.#log("Download projects complete.")
        }
        progress(1.0)
    }

    async #uploadCatalog(catalog: Projects) {
        this.#log("Uploading project catalog...")
        const jsonString = JSON.stringify(catalog, null, 2)
        const buffer = new TextEncoder().encode(jsonString).buffer
        return this.#cloudHandler.upload(CloudSyncProjects.RemoteCatalogPath, buffer)
    }
}