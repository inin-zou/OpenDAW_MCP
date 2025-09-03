import {ProjectMeta} from "./ProjectMeta"
import {Notifier, Observer, Option, Subscription, UUID} from "@opendaw/lib-std"
import {Projects} from "@/project/Projects"
import {Project} from "@opendaw/studio-core"

export class ProjectProfile {
    readonly #uuid: UUID.Format
    readonly #project: Project
    readonly #meta: ProjectMeta

    #cover: Option<ArrayBuffer>

    readonly #metaUpdated: Notifier<ProjectMeta>

    #saved: boolean
    #hasChanges: boolean = false

    constructor(uuid: UUID.Format,
                project: Project,
                meta: ProjectMeta,
                cover: Option<ArrayBuffer>,
                hasBeenSaved: boolean = false) {
        this.#uuid = uuid
        this.#project = project
        this.#meta = meta
        this.#cover = cover

        this.#saved = hasBeenSaved
        this.#metaUpdated = new Notifier<ProjectMeta>()
    }

    get uuid(): UUID.Format {return this.#uuid}
    get project(): Project {return this.#project}
    get meta(): ProjectMeta {return this.#meta}
    get cover(): Option<ArrayBuffer> {return this.#cover}

    async save(): Promise<void> {
        this.updateModifyDate()
        return this.#saved
            ? Projects.saveProject(this).then(() => {this.#hasChanges = false})
            : Promise.reject("Project has not been saved")
    }

    async saveAs(meta: ProjectMeta): Promise<Option<ProjectProfile>> {
        Object.assign(this.meta, meta)
        this.updateModifyDate()
        if (this.#saved) {
            // Copy project
            const uuid = UUID.generate()
            const project = this.project.copy()
            const meta = ProjectMeta.copy(this.meta)
            const session = new ProjectProfile(uuid, project, meta, Option.None, true)
            await Projects.saveProject(session)
            return Option.wrap(session)
        } else {
            // Save project
            return Projects.saveProject(this).then(() => {
                this.#saved = true
                this.#hasChanges = false
                this.#metaUpdated.notify(this.meta)
                return Option.None
            })
        }
    }

    saved(): boolean {return this.#saved}
    hasChanges(): boolean {return this.#hasChanges}

    subscribeMetaData(observer: Observer<ProjectMeta>): Subscription {
        return this.#metaUpdated.subscribe(observer)
    }

    updateCover(cover: Option<ArrayBuffer>): void {
        this.#cover = cover
        this.#hasChanges = true
    }

    updateMetaData<KEY extends keyof ProjectMeta>(key: KEY, value: ProjectMeta[KEY]): void {
        if (this.meta[key] === value) {return}
        this.meta[key] = value
        this.#hasChanges = true
        this.#metaUpdated.notify(this.meta)
    }

    updateModifyDate(): void {this.meta.modified = new Date().toISOString()}

    toString(): string {
        return `{uuid: ${UUID.toString(this.uuid)}, meta: ${JSON.stringify(this.meta)}}`
    }
}