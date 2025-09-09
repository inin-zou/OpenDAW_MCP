import {
    Arrays,
    DefaultObservableValue,
    int,
    MutableObservableValue,
    Notifier,
    Nullable,
    ObservableValue,
    Observer,
    Option,
    Subscription,
    SyncStream,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {SyncSource} from "@opendaw/lib-box"
import {AnimationFrame} from "@opendaw/lib-dom"
import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {
    AudioData,
    ClipNotification,
    ClipSequencingUpdates,
    EngineCommands,
    EngineProcessorOptions,
    EngineState,
    EngineStateSchema,
    EngineToClient,
    ExportStemsConfiguration,
    NoteSignal
} from "@opendaw/studio-adapters"
import {BoxIO} from "@opendaw/studio-boxes"
import {Project} from "./project/Project"
import {Engine} from "./Engine"

export class EngineWorklet extends AudioWorkletNode implements Engine {
    static ID: int = 0 | 0

    readonly id = EngineWorklet.ID++

    readonly #terminator: Terminator = new Terminator()

    readonly #project: Project
    readonly #playbackTimestamp: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #position: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #isPlaying: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isRecording: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isCountingIn: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #countInBeatsTotal: DefaultObservableValue<int> = new DefaultObservableValue(4)
    readonly #countInBeatsRemaining: DefaultObservableValue<int> = new DefaultObservableValue(0)
    readonly #metronomeEnabled: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #markerState: DefaultObservableValue<Nullable<[UUID.Bytes, int]>> = new DefaultObservableValue<Nullable<[UUID.Bytes, int]>>(null)
    readonly #notifyClipNotification: Notifier<ClipNotification>
    readonly #notifyNoteSignals: Notifier<NoteSignal>
    readonly #playingClips: Array<UUID.Bytes>
    readonly #commands: EngineCommands
    readonly #isReady: Promise<void>

    constructor(context: BaseAudioContext,
                project: Project,
                exportConfiguration?: ExportStemsConfiguration) {
        const numberOfChannels = ExportStemsConfiguration.countStems(Option.wrap(exportConfiguration)) * 2
        const reader = SyncStream.reader<EngineState>(EngineStateSchema(), state => {
            this.#isPlaying.setValue(state.isPlaying)
            this.#isRecording.setValue(state.isRecording)
            this.#isCountingIn.setValue(state.isCountingIn)
            this.#countInBeatsTotal.setValue(state.countInBeatsTotal)
            this.#countInBeatsRemaining.setValue(state.countInBeatsRemaining)
            this.#playbackTimestamp.setValue(state.playbackTimestamp)
            this.#position.setValue(state.position) // This must be the last to handle the state values before
        })

        super(context, "engine-processor", {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [numberOfChannels],
                processorOptions: {
                    sab: reader.buffer,
                    project: project.toArrayBuffer(),
                    exportConfiguration
                } satisfies EngineProcessorOptions
            }
        )

        const {resolve, promise} = Promise.withResolvers<void>()
        const messenger = Messenger.for(this.port)
        this.#project = project
        this.#isReady = promise
        this.#notifyClipNotification = this.#terminator.own(new Notifier<ClipNotification>())
        this.#notifyNoteSignals = this.#terminator.own(new Notifier<NoteSignal>())
        this.#playingClips = []
        this.#commands = this.#terminator.own(
            Communicator.sender<EngineCommands>(messenger.channel("engine-commands"),
                dispatcher => new class implements EngineCommands {
                    play(): void {dispatcher.dispatchAndForget(this.play)}
                    stop(reset: boolean): void {dispatcher.dispatchAndForget(this.stop, reset)}
                    setPosition(position: number): void {dispatcher.dispatchAndForget(this.setPosition, position)}
                    startRecording(countIn: boolean) {dispatcher.dispatchAndForget(this.startRecording, countIn)}
                    stopRecording() {dispatcher.dispatchAndForget(this.stopRecording)}
                    setMetronomeEnabled(enabled: boolean): void {dispatcher.dispatchAndForget(this.setMetronomeEnabled, enabled)}
                    queryLoadingComplete(): Promise<boolean> {
                        return dispatcher.dispatchAndReturn(this.queryLoadingComplete)
                    }
                    panic(): void {dispatcher.dispatchAndForget(this.panic)}
                    noteSignal(signal: NoteSignal): void {dispatcher.dispatchAndForget(this.noteSignal, signal)}
                    ignoreNoteRegion(uuid: UUID.Bytes): void {
                        dispatcher.dispatchAndForget(this.ignoreNoteRegion, uuid)
                    }
                    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Bytes>): void {
                        dispatcher.dispatchAndForget(this.scheduleClipPlay, clipIds)
                    }
                    scheduleClipStop(trackIds: ReadonlyArray<UUID.Bytes>): void {
                        dispatcher.dispatchAndForget(this.scheduleClipStop, trackIds)
                    }
                    terminate(): void {dispatcher.dispatchAndForget(this.terminate)}
                }))
        Communicator.executor<EngineToClient>(messenger.channel("engine-to-client"), {
                log: (message: string): void => console.log("WORKLET", message),
                ready: (): void => resolve(),
                fetchAudio: (uuid: UUID.Bytes): Promise<AudioData> => {
                    return new Promise((resolve, reject) => {
                        const handler = project.sampleManager.getOrCreate(uuid)
                        handler.subscribe(state => {
                            if (state.type === "error") {
                                reject(state.reason)
                            } else if (state.type === "loaded") {
                                resolve(handler.data.unwrap())
                            }
                        })
                    })
                },
                notifyClipSequenceChanges: (changes: ClipSequencingUpdates): void => {
                    changes.stopped.forEach(uuid => {
                        for (let i = 0; i < this.#playingClips.length; i++) {
                            if (UUID.equals(this.#playingClips[i], uuid)) {
                                this.#playingClips.splice(i, 1)
                                break
                            }
                        }
                    })
                    changes.started.forEach(uuid => this.#playingClips.push(uuid))
                    this.#notifyClipNotification.notify({type: "sequencing", changes})
                },
                switchMarkerState: (state: Nullable<[UUID.Bytes, int]>): void => this.#markerState.setValue(state)
            } satisfies EngineToClient
        )
        this.#terminator.ownAll(
            AnimationFrame.add(() => reader.tryRead()),
            project.liveStreamReceiver.connect(messenger.channel("engine-live-data")),
            new SyncSource<BoxIO.TypeMap>(project.boxGraph, messenger.channel("engine-sync"), false),
            this.#metronomeEnabled.catchupAndSubscribe(owner => this.#commands.setMetronomeEnabled(owner.getValue()))
        )
    }

    play(): void {this.#commands.play()}
    stop(reset: boolean = false): void {this.#commands.stop(reset)}
    setPosition(position: ppqn): void {this.#commands.setPosition(position)}
    startRecording(countIn: boolean): void {this.#commands.startRecording(countIn)}
    stopRecording(): void {this.#commands.stopRecording()}
    panic(): void {this.#commands.panic()}

    get isPlaying(): ObservableValue<boolean> {return this.#isPlaying}
    get isRecording(): ObservableValue<boolean> {return this.#isRecording}
    get isCountingIn(): ObservableValue<boolean> {return this.#isCountingIn}
    get countInBeatsTotal(): ObservableValue<int> {return this.#countInBeatsTotal}
    get countInBeatsRemaining(): ObservableValue<number> {return this.#countInBeatsRemaining}
    get position(): ObservableValue<ppqn> {return this.#position}
    get playbackTimestamp(): MutableObservableValue<number> {return this.#playbackTimestamp}
    get metronomeEnabled(): MutableObservableValue<boolean> {return this.#metronomeEnabled}
    get markerState(): ObservableValue<Nullable<[UUID.Bytes, int]>> {return this.#markerState}
    get project(): Project {return this.#project}

    isReady(): Promise<void> {return this.#isReady}
    queryLoadingComplete(): Promise<boolean> {return this.#commands.queryLoadingComplete()}
    noteSignal(signal: NoteSignal): void {this.#commands.noteSignal(signal)}
    subscribeNotes(observer: Observer<NoteSignal>): Subscription {return this.#notifyNoteSignals.subscribe(observer)}
    ignoreNoteRegion(uuid: UUID.Bytes): void {this.#commands.ignoreNoteRegion(uuid)}
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Bytes>): void {
        this.#notifyClipNotification.notify({type: "waiting", clips: clipIds})
        this.#commands.scheduleClipPlay(clipIds)
    }
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Bytes>): void {
        this.#commands.scheduleClipStop(trackIds)
    }
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription {
        observer({
            type: "sequencing",
            changes: {started: this.#playingClips, stopped: Arrays.empty(), obsolete: Arrays.empty()}
        })
        return this.#notifyClipNotification.subscribe(observer)
    }

    terminate(): void {
        this.#terminator.terminate()
        this.disconnect()
    }
}