import {
    DefaultObservableValue,
    Errors,
    MutableObservableValue,
    ObservableValue,
    Observer,
    Option,
    RuntimeNotifier,
    Terminable,
    UUID
} from "@opendaw/lib-std"
import {ProjectDialogs} from "@/project/ProjectDialogs"
import {Dialogs} from "@/ui/components/dialogs"
import {Promises} from "@opendaw/lib-runtime"
import {Files} from "@opendaw/lib-dom"
import {
    FilePickerAcceptTypes,
    Project,
    ProjectBundle,
    ProjectEnv,
    ProjectMeta,
    ProjectProfile, ProjectStorage,
    SampleAPI,
    SampleImporter
} from "@opendaw/studio-core"
import {SampleManager} from "@opendaw/studio-adapters"
import {SampleUtils} from "@/project/SampleUtils"

export class ProjectProfileService implements MutableObservableValue<Option<ProjectProfile>> {
    readonly #profile: DefaultObservableValue<Option<ProjectProfile>>

    readonly #env: ProjectEnv
    readonly #importer: SampleImporter
    readonly #sampleAPI: SampleAPI
    readonly #sampleManager: SampleManager

    constructor({env, importer, sampleAPI, sampleManager}: {
        env: ProjectEnv,
        importer: SampleImporter,
        sampleAPI: SampleAPI,
        sampleManager: SampleManager
    }) {
        this.#env = env
        this.#importer = importer
        this.#sampleAPI = sampleAPI
        this.#sampleManager = sampleManager
        this.#profile = new DefaultObservableValue<Option<ProjectProfile>>(Option.None)
    }

    getValue(): Option<ProjectProfile> {return this.#profile.getValue()}
    setValue(value: Option<ProjectProfile>): void {this.#profile.setValue(value)}
    subscribe(observer: Observer<ObservableValue<Option<ProjectProfile>>>): Terminable {
        return this.#profile.subscribe(observer)
    }
    catchupAndSubscribe(observer: Observer<ObservableValue<Option<ProjectProfile>>>): Terminable {
        observer(this)
        return this.#profile.subscribe(observer)
    }

    async save(): Promise<void> {
        return this.#profile.getValue()
            .ifSome(profile => profile.saved() ? profile.save() : this.saveAs())
    }

    async saveAs(): Promise<void> {
        return this.#profile.getValue().ifSome(async profile => {
            const {status, value: meta} = await Promises.tryCatch(ProjectDialogs.showSaveDialog({
                headline: "Save Project",
                meta: profile.meta
            }))
            if (status === "rejected") {return}
            const optProfile = await profile.saveAs(meta)
            optProfile.ifSome(profile => this.#profile.setValue(Option.wrap(profile)))
        })
    }

    async loadExisting(uuid: UUID.Bytes, meta: ProjectMeta) {
        const project: Project = await ProjectStorage.loadProject(uuid).then(buffer => Project.load(this.#env, buffer))
        await SampleUtils.verify(project.boxGraph, this.#importer, this.#sampleAPI, this.#sampleManager)
        const cover = await ProjectStorage.loadCover(uuid)
        this.#setProfile(uuid, project, meta, cover, true)
    }

    async loadTemplate(name: string): Promise<unknown> {
        console.debug(`load '${name}'`)
        const handler = Dialogs.processMonolog("Loading Template...")
        return fetch(`templates/${name}.od`)
            .then(res => res.arrayBuffer())
            .then(arrayBuffer => {
                const uuid = UUID.generate()
                const project = Project.load(this.#env, arrayBuffer)
                const meta = ProjectMeta.init(name)
                this.#setProfile(uuid, project, meta, Option.None)
            })
            .catch(reason => {
                console.warn("Could not load template", reason)
                Dialogs.info({headline: "Could not load template", message: "Please try again."}).finally()
            })
            .finally(() => handler.close())
    }

    async exportBundle() {
        return this.#profile.getValue().ifSome(async profile => {
            const progress = new DefaultObservableValue(0.0)
            const processDialog = RuntimeNotifier.progress({headline: "Bundling Project...", progress})
            const arrayBuffer = await ProjectBundle.encode(profile, progress)
            processDialog.terminate()
            const {status} = await Promises.tryCatch(Dialogs.approve({
                headline: "Save Project Bundle",
                message: "",
                approveText: "Save"
            }))
            if (status === "rejected") {return}
            try {
                await Files.save(arrayBuffer, {
                    suggestedName: `${profile.meta.name}.odb`,
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

    async importBundle() {
        try {
            const [file] = await Files.open({types: [FilePickerAcceptTypes.ProjectBundleFileType]})
            const arrayBuffer = await file.arrayBuffer()
            const exclude = this.#profile.getValue().map(({uuid}) => uuid).unwrapOrUndefined()
            const profile = await ProjectBundle.decode(this.#env, arrayBuffer, exclude)
            this.#profile.setValue(Option.wrap(profile))
        } catch (error) {
            if (!Errors.isAbort(error)) {
                Dialogs.info({headline: "Could not load project", message: String(error)}).finally()
            }
        }
    }

    async saveFile() {
        this.#profile.getValue().ifSome(async profile => {
            const arrayBuffer = profile.project.toArrayBuffer() as ArrayBuffer
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
            const project = Project.load(this.#env, await file.arrayBuffer())
            this.#setProfile(UUID.generate(), project, ProjectMeta.init(file.name), Option.None)
        } catch (error) {
            if (!Errors.isAbort(error)) {
                Dialogs.info({headline: "Could not load project", message: String(error)}).finally()
            }
        }
    }

    fromProject(project: Project, name: string): void {
        this.#setProfile(UUID.generate(), project, ProjectMeta.init(name), Option.None)
    }

    #setProfile(...args: ConstructorParameters<typeof ProjectProfile>): void {
        this.#profile.setValue(Option.wrap(this.#createProfile(...args)))
    }

    #createProfile(...args: ConstructorParameters<typeof ProjectProfile>): ProjectProfile {
        return new ProjectProfile(...args)
    }
}