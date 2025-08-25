import {ByteArrayOutput, Option, panic, Terminable, TerminableOwner, Terminator, UUID} from "@opendaw/lib-std"
import {BoxGraph, Editing} from "@opendaw/lib-box"
import {
    AudioBusBox,
    AudioUnitBox,
    BoxIO,
    GrooveShuffleBox,
    RootBox,
    TimelineBox,
    UserInterfaceBox
} from "@opendaw/studio-boxes"
import {
    BoxAdapters,
    BoxAdaptersContext,
    ClipSequencing,
    IconSymbol,
    MandatoryBoxes,
    ParameterFieldAdapters,
    ProjectDecoder,
    RootBoxAdapter,
    SampleManager,
    TimelineBoxAdapter,
    UserEditingManager,
    VertexSelection
} from "@opendaw/studio-adapters"
import {LiveStreamBroadcaster, LiveStreamReceiver} from "@opendaw/lib-fusion"
import {AudioUnitType} from "@opendaw/studio-enums"
import {ProjectEnv} from "./ProjectEnv"
import {Mixer} from "./Mixer"
import {ProjectApi} from "./ProjectApi"
import {ProjectMigration} from "./ProjectMigration"
import {CaptureManager} from "./capture/CaptureManager"

// Main Entry Point for a Project
//
export class Project implements BoxAdaptersContext, Terminable, TerminableOwner {
    static new(env: ProjectEnv): Project {
        const boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        const isoString = new Date().toISOString()
        console.debug(`New Project created on ${isoString}`)
        boxGraph.beginTransaction()
        const grooveShuffleBox = GrooveShuffleBox.create(boxGraph, UUID.generate(), box => {
            box.label.setValue("Groove Shuffle")
        })
        const rootBox = RootBox.create(boxGraph, UUID.generate(), box => {
            box.groove.refer(grooveShuffleBox)
            box.created.setValue(isoString)
        })
        const userInterfaceBox = UserInterfaceBox.create(boxGraph, UUID.generate())
        const masterBusBox = AudioBusBox.create(boxGraph, UUID.generate(), box => {
            box.collection.refer(rootBox.audioBusses)
            box.label.setValue("Output")
            box.icon.setValue(IconSymbol.toName(IconSymbol.SpeakerHeadphone))
            box.color.setValue(/*Colors.blue*/ "hsl(189, 100%, 65%)") // TODO
        })
        const masterAudioUnit = AudioUnitBox.create(boxGraph, UUID.generate(), box => {
            box.type.setValue(AudioUnitType.Output)
            box.collection.refer(rootBox.audioUnits)
            box.output.refer(rootBox.outputDevice)
            box.index.setValue(0)
        })
        const timelineBox = TimelineBox.create(boxGraph, UUID.generate())
        rootBox.timeline.refer(timelineBox.root)
        userInterfaceBox.root.refer(rootBox.users)
        masterBusBox.output.refer(masterAudioUnit.input)
        boxGraph.endTransaction()
        return new Project(env, boxGraph, {
            rootBox,
            userInterfaceBox,
            masterBusBox,
            masterAudioUnit,
            timelineBox
        })
    }

    static load(env: ProjectEnv, arrayBuffer: ArrayBuffer): Project {
        const skeleton = ProjectDecoder.decode(arrayBuffer)
        ProjectMigration.migrate(skeleton)
        return new Project(env, skeleton.boxGraph, skeleton.mandatoryBoxes)
    }

    static skeleton(env: ProjectEnv, skeleton: ProjectDecoder.Skeleton): Project {
        ProjectMigration.migrate(skeleton)
        return new Project(env, skeleton.boxGraph, skeleton.mandatoryBoxes)
    }

    readonly #terminator = new Terminator()

    readonly #env: ProjectEnv
    readonly boxGraph: BoxGraph<BoxIO.TypeMap>

    readonly rootBox: RootBox
    readonly userInterfaceBox: UserInterfaceBox
    readonly masterBusBox: AudioBusBox
    readonly masterAudioUnit: AudioUnitBox
    readonly timelineBox: TimelineBox

    readonly api: ProjectApi
    readonly captureManager: CaptureManager
    readonly editing: Editing
    readonly selection: VertexSelection
    readonly boxAdapters: BoxAdapters
    readonly userEditingManager: UserEditingManager
    readonly parameterFieldAdapters: ParameterFieldAdapters
    readonly liveStreamReceiver: LiveStreamReceiver
    readonly mixer: Mixer

    private constructor(env: ProjectEnv, boxGraph: BoxGraph, {
        rootBox,
        userInterfaceBox,
        masterBusBox,
        masterAudioUnit,
        timelineBox
    }: MandatoryBoxes) {
        this.#env = env
        this.boxGraph = boxGraph
        this.rootBox = rootBox
        this.userInterfaceBox = userInterfaceBox
        this.masterBusBox = masterBusBox
        this.masterAudioUnit = masterAudioUnit
        this.timelineBox = timelineBox

        this.api = new ProjectApi(this)
        this.captureManager = this.#terminator.own(new CaptureManager(this))
        this.editing = new Editing(this.boxGraph)
        this.selection = new VertexSelection(this.editing, this.boxGraph)
        this.parameterFieldAdapters = new ParameterFieldAdapters()
        this.boxAdapters = this.#terminator.own(new BoxAdapters(this))
        this.userEditingManager = new UserEditingManager(this.editing)
        this.userEditingManager.follow(this.userInterfaceBox)
        this.selection.switch(this.userInterfaceBox.selection)
        this.liveStreamReceiver = this.#terminator.own(new LiveStreamReceiver())
        this.mixer = new Mixer(this.rootBoxAdapter.audioUnits)

        console.debug(`Project was created on ${this.rootBoxAdapter.created.toString()}`)
    }

    own<T extends Terminable>(terminable: T): T {return this.#terminator.own<T>(terminable)}
    ownAll<T extends Terminable>(...terminables: Array<T>): void {return this.#terminator.ownAll<T>(...terminables)}
    spawn(): Terminator {return this.#terminator.spawn()}

    get env(): ProjectEnv {return this.#env}
    get bpm(): number {return this.timelineBox.bpm.getValue()}
    get rootBoxAdapter(): RootBoxAdapter {return this.boxAdapters.adapterFor(this.rootBox, RootBoxAdapter)}
    get timelineBoxAdapter(): TimelineBoxAdapter {return this.boxAdapters.adapterFor(this.timelineBox, TimelineBoxAdapter)}
    get sampleManager(): SampleManager {return this.#env.sampleManager}
    get clipSequencing(): ClipSequencing {return panic("Only available in audio context")}
    get isAudioContext(): boolean {return false}
    get isMainThread(): boolean {return true}
    get liveStreamBroadcaster(): LiveStreamBroadcaster {return panic("Only available in audio context")}

    get skeleton(): ProjectDecoder.Skeleton {
        return {
            boxGraph: this.boxGraph,
            mandatoryBoxes: {
                rootBox: this.rootBox,
                timelineBox: this.timelineBox,
                masterBusBox: this.masterBusBox,
                masterAudioUnit: this.masterAudioUnit,
                userInterfaceBox: this.userInterfaceBox
            }
        }
    }

    toArrayBuffer(): ArrayBufferLike {
        const output = ByteArrayOutput.create()
        output.writeInt(ProjectDecoder.MAGIC_HEADER_OPEN)
        output.writeInt(ProjectDecoder.FORMAT_VERSION)
        // store all boxes
        const boxGraphChunk = this.boxGraph.toArrayBuffer()
        output.writeInt(boxGraphChunk.byteLength)
        output.writeBytes(new Int8Array(boxGraphChunk))
        // store mandatory boxes' addresses
        UUID.toDataOutput(output, this.rootBox.address.uuid)
        UUID.toDataOutput(output, this.userInterfaceBox.address.uuid)
        UUID.toDataOutput(output, this.masterBusBox.address.uuid)
        UUID.toDataOutput(output, this.masterAudioUnit.address.uuid)
        UUID.toDataOutput(output, this.timelineBox.address.uuid)
        return output.toArrayBuffer()
    }

    copy(): Project {return Project.load(this.#env, this.toArrayBuffer() as ArrayBuffer)}

    terminate(): void {this.#terminator.terminate()}
}