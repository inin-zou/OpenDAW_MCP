import {
    DefaultObservableValue,
    int,
    MutableObservableValue,
    Nullable,
    ObservableValue,
    Observer,
    Option,
    Subscription,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {ClipNotification, NoteSignal} from "@opendaw/studio-adapters"
import {Engine} from "./Engine"
import {EngineWorklet} from "./EngineWorklet"
import {Project} from "./Project"

export class EngineFacade implements Engine {
    readonly #terminator: Terminator = new Terminator()
    readonly #lifecycle: Terminator = this.#terminator.own(new Terminator())
    readonly #playbackTimestamp: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #countInBeatsTotal: DefaultObservableValue<int> = new DefaultObservableValue(4)
    readonly #countInBeatsRemaining: DefaultObservableValue<int> = new DefaultObservableValue(0)
    readonly #position: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #isPlaying: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isRecording: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isCountingIn: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #metronomeEnabled: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #markerState: DefaultObservableValue<Nullable<[UUID.Format, int]>> =
        new DefaultObservableValue<Nullable<[UUID.Format, int]>>(null)

    #client: Option<EngineWorklet> = Option.None

    constructor() {}

    setClient(client: EngineWorklet) {
        this.#client = Option.wrap(client)
        this.#lifecycle.terminate()
        this.#lifecycle.ownAll(
            client.playbackTimestamp.catchupAndSubscribe(owner => this.#playbackTimestamp.setValue(owner.getValue())),
            client.countInBeatsTotal.catchupAndSubscribe(owner => this.#countInBeatsTotal.setValue(owner.getValue())),
            client.countInBeatsRemaining.catchupAndSubscribe(owner => this.#countInBeatsRemaining.setValue(owner.getValue())),
            client.position.catchupAndSubscribe(owner => this.#position.setValue(owner.getValue())),
            client.isPlaying.catchupAndSubscribe(owner => this.#isPlaying.setValue(owner.getValue())),
            client.isRecording.catchupAndSubscribe(owner => this.#isRecording.setValue(owner.getValue())),
            client.isCountingIn.catchupAndSubscribe(owner => this.#isCountingIn.setValue(owner.getValue())),
            client.metronomeEnabled.catchupAndSubscribe(owner => this.#metronomeEnabled.setValue(owner.getValue())),
            client.markerState.catchupAndSubscribe(owner => this.#markerState.setValue(owner.getValue())),
            this.metronomeEnabled.catchupAndSubscribe(owner => client.metronomeEnabled.setValue(owner.getValue()))
        )
    }

    releaseClient(): void {
        this.#lifecycle.terminate()
        this.#client.ifSome(client => client.terminate())
        this.#client = Option.None
    }

    play(): void {this.#client.ifSome(client => client.play())}
    stop(reset: boolean = false): void {this.#client.ifSome(client => client.stop(reset))}
    setPosition(position: ppqn): void {this.#client.ifSome(client => client.setPosition(position))}
    startRecording(countIn: boolean): void {this.#client.ifSome(client => client.startRecording(countIn))}
    stopRecording(): void {this.#client.ifSome(client => client.stopRecording())}

    get position(): ObservableValue<ppqn> {return this.#position}
    get isPlaying(): ObservableValue<boolean> {return this.#isPlaying}
    get isRecording(): ObservableValue<boolean> {return this.#isRecording}
    get isCountingIn(): ObservableValue<boolean> {return this.#isCountingIn}
    get metronomeEnabled(): MutableObservableValue<boolean> {return this.#metronomeEnabled}
    get playbackTimestamp(): ObservableValue<ppqn> {return this.#playbackTimestamp}
    get countInBeatsTotal(): ObservableValue<int> {return this.#countInBeatsTotal}
    get countInBeatsRemaining(): ObservableValue<int> {return this.#countInBeatsRemaining}
    get markerState(): DefaultObservableValue<Nullable<[UUID.Format, int]>> {return this.#markerState}
    get project(): Project {return this.#client.unwrap("No engine to get project").project}

    isReady(): Promise<void> {return this.#client.mapOr(client => client.isReady(), Promise.resolve())}
    queryLoadingComplete(): Promise<boolean> {
        return this.#client.mapOr(client => client.queryLoadingComplete(), Promise.resolve(false))
    }
    panic(): void {this.#client.ifSome(client => client.panic())}
    sampleRate(): number {return this.#client.isEmpty() ? 44_100 : this.#client.unwrap().context.sampleRate}
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription {
        return this.#client.unwrap("No engine to subscribeClipNotification").subscribeClipNotification(observer)
    }
    subscribeNotes(observer: Observer<NoteSignal>): Subscription {
        return this.#client.unwrap("No engine to subscribeNotes").subscribeNotes(observer)
    }
    ignoreNoteRegion(uuid: UUID.Format): void {
        this.#client.unwrap("No engine to ignoreNoteRegion").ignoreNoteRegion(uuid)
    }
    noteSignal(signal: NoteSignal): void {
        this.#client.unwrap("No engine to noteOn").noteSignal(signal)
    }
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void {
        this.#client.unwrap("No engine to scheduleClipPlay").scheduleClipPlay(clipIds)
    }
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void {
        this.#client.unwrap("No engine to scheduleClipStop").scheduleClipStop(trackIds)
    }

    terminate(): void {
        this.releaseClient()
        this.#terminator.terminate()
    }
}