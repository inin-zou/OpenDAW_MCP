import {
    assert,
    DefaultObservableValue,
    EmptyExec,
    Func,
    int,
    isDefined,
    Notifier,
    Nullable,
    Observer,
    Option,
    panic,
    Procedure,
    Progress,
    Provider,
    Subscription,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {TimelineRange} from "@/ui/timeline/TimelineRange.ts"
import {initAppMenu} from "@/service/app-menu"
import {Snapping} from "@/ui/timeline/Snapping.ts"
import {PanelContents} from "@/ui/workspace/PanelContents.tsx"
import {createPanelFactory} from "@/ui/workspace/PanelFactory.tsx"
import {SpotlightDataSupplier} from "@/ui/spotlight/SpotlightDataSupplier.ts"
import {Workspace} from "@/ui/workspace/Workspace.ts"
import {PanelType} from "@/ui/workspace/PanelType.ts"
import {Dialogs, showApproveDialog, showInfoDialog, showProcessDialog} from "@/ui/components/dialogs.tsx"
import {BuildInfo} from "@/BuildInfo.ts"
import {MidiDeviceAccess} from "@/midi/devices/MidiDeviceAccess"
import {SamplePlayback} from "@/service/SamplePlayback"
import {Shortcuts} from "@/service/Shortcuts"
import {ProjectMeta} from "@/project/ProjectMeta"
import {ProjectSession} from "@/project/ProjectSession"
import {SessionService} from "./SessionService"
import {StudioSignal} from "./StudioSignal"
import {Projects} from "@/project/Projects"
import {SampleDialogs} from "@/ui/browse/SampleDialogs"
import {AudioOutputDevice} from "@/audio/AudioOutputDevice"
import {FooterLabel} from "@/service/FooterLabel"
import {RouteLocation} from "@opendaw/lib-jsx"
import {PPQN} from "@opendaw/lib-dsp"
import {Browser, ConsoleCommands, Errors, Files} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {ExportStemsConfiguration, Sample} from "@opendaw/studio-adapters"
import {ProjectDialogs} from "@/project/ProjectDialogs"
import {AudioImporter} from "@/audio/AudioImport"
import {Address} from "@opendaw/lib-box"
import {Recovery} from "@/Recovery.ts"
import {MIDILearning} from "@/midi/devices/MIDILearning"
import {
    DawProject,
    DawProjectImport,
    EngineFacade,
    EngineWorklet,
    MainThreadSampleManager,
    Project,
    ProjectEnv,
    Recording,
    Worklets
} from "@opendaw/studio-core"
import {AudioOfflineRenderer} from "@/audio/AudioOfflineRenderer"
import {FilePickerAcceptTypes} from "@/ui/FilePickerAcceptTypes"
import {Xml} from "@opendaw/lib-xml"
import {MetaDataSchema} from "@opendaw/lib-dawproject"

/**
 * I am just piling stuff after stuff in here to boot the environment.
 * I suppose this gets cleaned up sooner or later.
 */

const range = new TimelineRange({padding: 12})
range.minimum = PPQN.fromSignature(3, 8)
range.maxUnits = PPQN.fromSignature(128, 1)
range.showUnitInterval(0, PPQN.fromSignature(16, 1))

const snapping = new Snapping(range)

export type Session = {
    readonly uuid: Readonly<UUID.Format>
    readonly project: Project
    readonly meta: ProjectMeta
}

export class StudioService implements ProjectEnv {
    readonly layout = {
        systemOpen: new DefaultObservableValue<boolean>(false),
        helpVisible: new DefaultObservableValue<boolean>(true),
        screen: new DefaultObservableValue<Nullable<Workspace.ScreenKeys>>("default")
    } as const
    readonly transport = {
        loop: new DefaultObservableValue<boolean>(false)
    } as const
    readonly timeline = {
        range,
        snapping,
        clips: {
            count: new DefaultObservableValue(3),
            visible: new DefaultObservableValue(true)
        },
        followPlaybackCursor: new DefaultObservableValue(true),
        primaryVisible: new DefaultObservableValue(true)
    } as const
    readonly menu = initAppMenu(this)
    readonly sessionService = new SessionService(this)
    readonly panelLayout = new PanelContents(createPanelFactory(this))
    readonly spotlightDataSupplier = new SpotlightDataSupplier()
    readonly samplePlayback: SamplePlayback
    // noinspection JSUnusedGlobalSymbols
    readonly _shortcuts = new Shortcuts(this) // TODO reference will be used later in a key-mapping configurator
    readonly engine = new EngineFacade()
    readonly recovery = new Recovery(this)
    readonly midiLearning = new MIDILearning(this)
    readonly #signals = new Notifier<StudioSignal>()

    #factoryFooterLabel: Option<Provider<FooterLabel>> = Option.None

    #midi: Option<MidiDeviceAccess> = Option.None

    constructor(readonly context: AudioContext,
                readonly worklets: Worklets,
                readonly audioDevices: AudioOutputDevice,
                readonly sampleManager: MainThreadSampleManager,
                readonly buildInfo: BuildInfo) {
        this.samplePlayback = new SamplePlayback(context)
        const lifeTime = new Terminator()
        const observer = (optSession: Option<ProjectSession>) => {
            const root = RouteLocation.get().path === "/"
            if (root) {this.layout.screen.setValue(null)}
            lifeTime.terminate()
            if (optSession.nonEmpty()) {
                const session = optSession.unwrap()
                const {project, meta} = session
                console.debug(`switch to %c${meta.name}%c`, "color: hsl(25, 69%, 63%)", "color: inherit")
                const {timelineBox, editing, userEditingManager} = project
                const loopState = this.transport.loop
                const loopEnabled = timelineBox.loopArea.enabled
                loopState.setValue(loopEnabled.getValue())
                lifeTime.ownAll(
                    project,
                    loopState.subscribe(value => editing.modify(() => loopEnabled.setValue(value.getValue()))),
                    userEditingManager.timeline.catchupAndSubscribe(option => option
                        .ifSome(() => this.panelLayout.showIfAvailable(PanelType.ContentEditor))),
                    timelineBox.durationInPulses.catchupAndSubscribe(owner => range.maxUnits = owner.getValue() + PPQN.Bar),
                    {terminate: () => session.saveMidiConfiguration()}
                )
                range.showUnitInterval(0, PPQN.fromSignature(16, 1))
                session.loadMidiConfiguration().then()

                // -------------------------------
                // Show views if content available
                // -------------------------------
                //
                // Markers
                if (timelineBox.markerTrack.markers.pointerHub.nonEmpty()) {
                    this.timeline.primaryVisible.setValue(true)
                }
                // Clips
                const maxClipIndex: int = project.rootBoxAdapter.audioUnits.adapters()
                    .reduce((max, unit) => Math.max(max, unit.tracks.values()
                        .reduce((max, track) => Math.max(max, track.clips.collection.getMinFreeIndex()), 0)), 0)
                if (maxClipIndex > 0) {
                    this.timeline.clips.count.setValue(maxClipIndex + 1)
                    this.timeline.clips.visible.setValue(true)
                } else {
                    this.timeline.clips.count.setValue(3)
                    this.timeline.clips.visible.setValue(false)
                }
                this.#startAudioWorklet(lifeTime, project)
                if (root) {this.switchScreen("default")}
            } else {
                this.engine.releaseClient()
                range.maxUnits = PPQN.fromSignature(128, 1)
                range.showUnitInterval(0, PPQN.fromSignature(16, 1))
                this.layout.screen.setValue("dashboard")
            }
        }
        this.sessionService.catchupAndSubscribe(owner => observer(owner.getValue()))

        ConsoleCommands.exportAccessor("box.graph.boxes",
            () => this.runIfProject(project => project.boxGraph.debugBoxes()))
        ConsoleCommands.exportMethod("box.graph.lookup",
            (address: string) => this.runIfProject(({boxGraph}) =>
                boxGraph.findVertex(Address.decode(address))
                    .match({
                        none: () => "not found",
                        some: vertex => vertex.toString()
                    }))
                .match({none: () => "no project", some: value => value}))
        ConsoleCommands.exportAccessor("box.graph.dependencies",
            () => this.runIfProject(project => project.boxGraph.debugDependencies()))

        if (!Browser.isLocalHost()) {
            window.addEventListener("beforeunload", (event: Event) => {
                if (!navigator.onLine) {
                    event.preventDefault()
                }
                if (this.hasProjectSession && (this.session.hasChanges() || !this.project.editing.isEmpty())) {
                    event.preventDefault()
                }
            })
        }

        this.spotlightDataSupplier.registerAction("Create Synth", EmptyExec)
        this.spotlightDataSupplier.registerAction("Create Drumcomputer", EmptyExec)
        this.spotlightDataSupplier.registerAction("Create ModularSystem", EmptyExec)

        const configLocalStorageBoolean = (value: DefaultObservableValue<boolean>,
                                           item: string,
                                           set: Procedure<boolean>,
                                           defaultValue: boolean = false) => {
            value.setValue((localStorage.getItem(item) ?? String(defaultValue)) === String(true))
            value.catchupAndSubscribe(owner => {
                const bool = owner.getValue()
                set(bool)
                try {
                    localStorage.setItem(item, String(bool))
                } catch (_reason: any) {}
            })
        }

        configLocalStorageBoolean(this.layout.helpVisible, "help-visible",
            visible => document.body.classList.toggle("help-hidden", !visible), true)

        this.recovery.restoreSession().then(optSession => {
            if (optSession.nonEmpty()) {
                this.sessionService.setValue(optSession)
            }
        }, EmptyExec)
    }

    get sampleRate(): number {return this.context.sampleRate}

    get midi(): Option<MidiDeviceAccess> {return this.#midi}

    panicEngine(): void {this.engine.panic()}

    async closeProject() {
        RouteLocation.get().navigateTo("/")
        if (!this.hasProjectSession) {
            this.switchScreen("dashboard")
            return
        }
        if (this.project.editing.isEmpty()) {
            this.sessionService.setValue(Option.None)
        } else {
            try {
                await showApproveDialog({headline: "Closing Project?", message: "You will lose all progress!"})
            } catch (error) {
                if (!Errors.isAbort(error)) {panic(String(error))}
                return
            }
            this.sessionService.setValue(Option.None)
        }
    }

    cleanSlate(): void {
        this.sessionService.setValue(Option.wrap(new ProjectSession(this,
            UUID.generate(), Project.new(this), ProjectMeta.init("Untitled"), Option.None)))
    }

    startRecording(countIn: boolean): void {
        if (!this.hasProjectSession) {return}
        Recording.start({
            sampleManager: this.sampleManager,
            project: this.project,
            worklets: this.worklets,
            engine: this.engine,
            requestMIDIAccess: MidiDeviceAccess.requestMidiAccess,
            audioContext: this.context
        }, countIn).catch(Dialogs.WarningProcedure)
    }

    stopRecording(): void {this.engine.stopRecording()}
    isRecording(): boolean {return this.engine.isRecording.getValue()}

    async save(): Promise<void> {return this.sessionService.save()}
    async saveAs(): Promise<void> {return this.sessionService.saveAs()}
    async browse(): Promise<void> {return this.sessionService.browse()}
    async loadTemplate(name: string): Promise<unknown> {return this.sessionService.loadTemplate(name)}
    async exportZip() {return this.sessionService.exportZip()}
    async importZip() {return this.sessionService.importZip()}
    async deleteProject(uuid: UUID.Format, meta: ProjectMeta): Promise<void> {
        if (this.sessionService.getValue().ifSome(session => UUID.equals(session.uuid, uuid)) === true) {
            await this.closeProject()
        }
        const {status} = await Promises.tryCatch(Projects.deleteProject(uuid))
        if (status === "resolved") {
            this.#signals.notify({type: "delete-project", meta})
        }
    }

    async exportMixdown() {
        return this.sessionService.getValue()
            .ifSome(async ({project, meta}) => {
                await this.context.suspend()
                await AudioOfflineRenderer.start(project, meta, Option.None)
                this.context.resume().then()
            })
    }

    async exportStems() {
        return this.sessionService.getValue()
            .ifSome(async ({project, meta}) => {
                const {
                    status,
                    error,
                    value: config
                } = await Promises.tryCatch(ProjectDialogs.showExportStemsDialog(project))
                if (status === "rejected") {
                    console.log(error)
                    if (Errors.isAbort(error)) {return}
                    throw error
                }
                ExportStemsConfiguration.sanitizeExportNamesInPlace(config)
                await this.context.suspend()
                await AudioOfflineRenderer.start(project, meta, Option.wrap(config))
                this.context.resume().then(EmptyExec, EmptyExec)
            })
    }

    async browseForSamples(multiple: boolean = true) {
        const {error, status, value: files} = await SampleDialogs.nativeFileBrowser(multiple)
        if (status === "rejected") {
            if (Errors.isAbort(error)) {return} else {return panic(String(error)) }
        }
        const progress = new DefaultObservableValue(0.0)
        const progressDialog = showProcessDialog(`Importing ${files.length === 1 ? "Sample" : "Samples"}...`, progress)
        const progressHandler = Progress.split(value => progress.setValue(value), files.length)
        const rejected: Array<string> = []
        for (const [index, file] of files.entries()) {
            const arrayBuffer = await file.arrayBuffer()
            const {
                status,
                error
            } = await Promises.tryCatch(this.importSample({
                name: file.name,
                arrayBuffer: arrayBuffer,
                progressHandler: progressHandler[index]
            }))
            if (status === "rejected") {rejected.push(String(error))}
        }
        progressDialog.close()
        if (rejected.length > 0) {
            await showInfoDialog({
                headline: "Sample Import Issues",
                message: `${rejected.join(", ")} could not be imported.`
            })
        }
    }

    async importSample({uuid, name, arrayBuffer, progressHandler = Progress.Empty}: {
        uuid?: UUID.Format,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler?: Progress.Handler
    }): Promise<Sample> {
        console.debug(`Importing '${name}' (${arrayBuffer.byteLength >> 10}kb)`)
        return AudioImporter.run(this.context, {uuid, name, arrayBuffer, progressHandler})
            .then(sample => {
                this.#signals.notify({type: "import-sample", sample})
                return sample
            })
    }

    async saveFile() {return await this.sessionService.saveFile()}
    async loadFile() {return this.sessionService.loadFile()}

    async importDawproject() {
        const {status, value, error} =
            await Promises.tryCatch(Files.open({types: [FilePickerAcceptTypes.DawprojectFileType]}))
        if (status === "rejected") {
            if (Errors.isAbort(error)) {return}
            return panic(String(error))
        }
        const file = value.at(0)
        if (!isDefined(file)) {return}
        const arrayBuffer = await file.arrayBuffer()
        const {project: projectSchema, resources} = await DawProject.decode(arrayBuffer)
        const importResult = await Promises.tryCatch(DawProjectImport.read(projectSchema, resources))
        if (importResult.status === "rejected") {
            return showInfoDialog({headline: "Import Error", message: String(importResult.error)})
        }
        const {skeleton, audioIds} = importResult.value
        await Promise.all(audioIds
            .map(uuid => resources.fromUUID(uuid))
            .map(resource => this.importSample({
                uuid: resource.uuid,
                name: resource.name,
                arrayBuffer: resource.buffer
            })))
        this.sessionService.fromProject(Project.skeleton(this, skeleton), "Dawproject")
    }

    async exportDawproject() {
        if (!this.hasProjectSession) {return}
        const {project, meta} = this.session
        const {status, error, value: zip} = await Promises.tryCatch(DawProject.encode(project, Xml.element({
            title: meta.name,
            year: new Date().getFullYear().toString(),
            website: "https://opendaw.studio"
        }, MetaDataSchema)))
        if (status === "rejected") {
            return showInfoDialog({headline: "Export Error", message: String(error)})
        } else {
            const {status, error} = await Promises.tryCatch(Files.save(zip,
                {types: [FilePickerAcceptTypes.DawprojectFileType]}))
            if (status === "rejected" && !Errors.isAbort(error)) {
                return error
            } else {
                return
            }
        }
    }

    fromProject(project: Project, name: string): void {this.sessionService.fromProject(project, name)}

    runIfProject<R>(procedure: Func<Project, R>): Option<R> {
        return this.sessionService.getValue().map(({project}) => procedure(project))
    }

    get project(): Project {return this.session.project}
    get session(): ProjectSession {return this.sessionService.getValue().unwrap("No session available")}
    get hasProjectSession(): boolean {return this.sessionService.getValue().nonEmpty()}

    subscribeSignal<T extends StudioSignal["type"]>(
        observer: Observer<Extract<StudioSignal, { type: T }>>, type: T): Subscription {
        return this.#signals.subscribe(signal => {
            if (signal.type === type) {
                observer(signal as Extract<StudioSignal, { type: T }>)
            }
        })
    }

    switchScreen(key: Nullable<Workspace.ScreenKeys>): void {
        this.layout.screen.setValue(key)
        RouteLocation.get().navigateTo("/")
    }

    registerFooter(factory: Provider<FooterLabel>): void {
        this.#factoryFooterLabel = Option.wrap(factory)
    }

    factoryFooterLabel(): Option<Provider<FooterLabel>> {return this.#factoryFooterLabel}

    resetPeaks(): void {this.#signals.notify({type: "reset-peaks"})}

    #startAudioWorklet(terminator: Terminator, project: Project): void {
        console.debug(`start AudioWorklet`)
        const lifecycle = terminator.spawn()
        const client: EngineWorklet = lifecycle.own(this.worklets.createEngine(project))
        const handler = async (event: any) => {
            console.warn(event)
            // we will only accept the first error
            client.removeEventListener("error", handler)
            client.removeEventListener("processorerror", handler)
            const screen = this.layout.screen.getValue()
            // we need to restart the screen to subscribe to new broadcaster instances
            this.switchScreen(null)
            lifecycle.terminate()
            await showInfoDialog({
                headline: "Audio-Engine Error",
                message: String(event?.message ?? event),
                okText: "Restart"
            })
            this.#startAudioWorklet(lifecycle, project)
            this.switchScreen(screen)
        }
        client.addEventListener("error", handler)
        client.addEventListener("processorerror", handler)
        client.connect(this.context.destination)
        this.engine.setClient(client)
    }

    async verifyProject() {
        if (!this.hasProjectSession) {return}
        const {boxGraph, rootBox, userInterfaceBox, masterBusBox, timelineBox} = this.project
        assert(rootBox.isAttached(), "[verify] rootBox is not attached")
        assert(userInterfaceBox.isAttached(), "[verify] userInterfaceBox is not attached")
        assert(masterBusBox.isAttached(), "[verify] masterBusBox is not attached")
        assert(timelineBox.isAttached(), "[verify] timelineBox is not attached")
        const result = boxGraph.verifyPointers()
        await showInfoDialog({message: `Project is okay. All ${result.count} pointers are fine.`})
    }
}