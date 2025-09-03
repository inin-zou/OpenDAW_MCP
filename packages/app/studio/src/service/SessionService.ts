import {ProjectProfile} from "@/project/ProjectProfile"
import {
    DefaultObservableValue,
    MutableObservableValue,
    ObservableValue,
    Observer,
    Option,
    Terminable,
    UUID
} from "@opendaw/lib-std"
import {ProjectDialogs} from "@/project/ProjectDialogs"
import {Projects} from "@/project/Projects"
import {ProjectMeta} from "@/project/ProjectMeta"
import {Dialogs} from "@/ui/components/dialogs"
import {StudioService} from "./StudioService"
import {Promises} from "@opendaw/lib-runtime"
import {FilePickerAcceptTypes} from "@/ui/FilePickerAcceptTypes.ts"
import {Errors, Files} from "@opendaw/lib-dom"
import {Project} from "@opendaw/studio-core"

export class SessionService implements MutableObservableValue<Option<ProjectProfile>> {
    readonly #service: StudioService
    readonly #session: DefaultObservableValue<Option<ProjectProfile>>

    constructor(service: StudioService) {
        this.#service = service
        this.#session = new DefaultObservableValue<Option<ProjectProfile>>(Option.None)
    }

    getValue(): Option<ProjectProfile> {return this.#session.getValue()}
    setValue(value: Option<ProjectProfile>): void {this.#session.setValue(value)}
    subscribe(observer: Observer<ObservableValue<Option<ProjectProfile>>>): Terminable {
        return this.#session.subscribe(observer)
    }
    catchupAndSubscribe(observer: Observer<ObservableValue<Option<ProjectProfile>>>): Terminable {
        observer(this)
        return this.#session.subscribe(observer)
    }

    async save(): Promise<void> {
        return this.#session.getValue()
            .ifSome(session => session.saved() ? session.save() : this.saveAs())
    }

    async saveAs(): Promise<void> {
        return this.#session.getValue().ifSome(async session => {
            const {status, value: meta} = await Promises.tryCatch(ProjectDialogs.showSaveDialog({
                headline: "Save Project",
                meta: session.meta
            }))
            if (status === "rejected") {return}
            const optSession = await session.saveAs(meta)
            optSession.ifSome(session => this.#session.setValue(Option.wrap(session)))
        })
    }

    async browse(): Promise<void> {
        const {status, value} = await Promises.tryCatch(ProjectDialogs.showBrowseDialog(this.#service))
        if (status === "resolved") {
            const [uuid, meta] = value
            await this.loadExisting(uuid, meta)
        }
    }

    async loadExisting(uuid: UUID.Format, meta: ProjectMeta) {
        console.debug(UUID.toString(uuid))
        const project = await Projects.loadProject(this.#service, uuid)
        const cover = await Projects.loadCover(uuid)
        this.#setSession(uuid, project, meta, cover, true)
    }

    async loadTemplate(name: string): Promise<unknown> {
        console.debug(`load '${name}'`)
        const handler = Dialogs.processMonolog("Loading Template...")
        return fetch(`templates/${name}.od`)
            .then(res => res.arrayBuffer())
            .then(arrayBuffer => {
                const uuid = UUID.generate()
                const project = Project.load(this.#service, arrayBuffer)
                const meta = ProjectMeta.init(name)
                this.#setSession(uuid, project, meta, Option.None)
            })
            .catch(reason => {
                console.warn("Could not load template", reason)
                Dialogs.info({headline: "Could not load template", message: "Please try again."}).finally()
            })
            .finally(() => handler.close())
    }

    async exportZip() {
        return this.#session.getValue().ifSome(async session => {
            const progress = new DefaultObservableValue(0.0)
            const processDialog = Dialogs.progress("Bundling Project...", progress)
            const arrayBuffer = await Projects.exportBundle(session, progress)
            processDialog.close()
            const {status} = await Promises.tryCatch(Dialogs.approve({
                headline: "Save Project Bundle",
                message: "",
                approveText: "Save"
            }))
            if (status === "rejected") {return}
            try {
                await Files.save(arrayBuffer, {
                    suggestedName: `${session.meta.name}.odb`,
                    types: [FilePickerAcceptTypes.ProjectBundleFileType],
                    startIn: "desktop"
                })
            } catch (error) {
                if (!Errors.isAbort(error)) {
                    Dialogs.info({headline: "Could not export project", message: String(error)}).finally()
                }
            }
        })
    }

    async importZip() {
        try {
            const [file] = await Files.open({types: [FilePickerAcceptTypes.ProjectBundleFileType]})
            const session = await Projects.importBundle(this.#service, await file.arrayBuffer())
            this.#session.setValue(Option.wrap(session))
        } catch (error) {
            if (!Errors.isAbort(error)) {
                Dialogs.info({headline: "Could not load project", message: String(error)}).finally()
            }
        }
    }

    async saveFile() {
        this.#session.getValue().ifSome(async session => {
            const arrayBuffer = session.project.toArrayBuffer() as ArrayBuffer
            try {
                const fileName = await Files.save(arrayBuffer, {
                    suggestedName: "project.od",
                    types: [FilePickerAcceptTypes.ProjectFileType]
                })
                Dialogs.info({message: `Project '${fileName}' saved successfully!`}).finally()
            } catch (error) {
                if (!Errors.isAbort(error)) {
                    Dialogs.info({message: `Error saving project: ${error}`}).finally()
                }
            }
        })
    }

    async loadFile() {
        try {
            const [file] = await Files.open({types: [FilePickerAcceptTypes.ProjectFileType]})
            const project = Project.load(this.#service, await file.arrayBuffer())
            this.#setSession(UUID.generate(), project, ProjectMeta.init(file.name), Option.None)
        } catch (error) {
            if (!Errors.isAbort(error)) {
                Dialogs.info({headline: "Could not load project", message: String(error)}).finally()
            }
        }
    }

    fromProject(project: Project, name: string): void {
        this.#setSession(UUID.generate(), project, ProjectMeta.init(name), Option.None)
    }

    #setSession(...args: ConstructorParameters<typeof ProjectProfile>): void {
        this.#session.setValue(Option.wrap(this.#createSession(...args)))
    }

    #createSession(...args: ConstructorParameters<typeof ProjectProfile>): ProjectProfile {
        return new ProjectProfile(...args)
    }
}