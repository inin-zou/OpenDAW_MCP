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
import {Project} from "./project/Project"

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
    readonly #markerState: DefaultObservableValue<Nullable<[UUID.Bytes, int]>> =
        new DefaultObservableValue<Nullable<[UUID.Bytes, int]>>(null)

    #worklet: Option<EngineWorklet> = Option.None

    constructor() {}

    setWorklet(worklet: EngineWorklet) {
        this.#worklet = Option.wrap(worklet)
        this.#lifecycle.terminate()
        this.#lifecycle.ownAll(
            worklet.playbackTimestamp.catchupAndSubscribe(owner => this.#playbackTimestamp.setValue(owner.getValue())),
            worklet.countInBeatsTotal.catchupAndSubscribe(owner => this.#countInBeatsTotal.setValue(owner.getValue())),
            worklet.countInBeatsRemaining.catchupAndSubscribe(owner => this.#countInBeatsRemaining.setValue(owner.getValue())),
            worklet.position.catchupAndSubscribe(owner => this.#position.setValue(owner.getValue())),
            worklet.isPlaying.catchupAndSubscribe(owner => this.#isPlaying.setValue(owner.getValue())),
            worklet.isRecording.catchupAndSubscribe(owner => this.#isRecording.setValue(owner.getValue())),
            worklet.isCountingIn.catchupAndSubscribe(owner => this.#isCountingIn.setValue(owner.getValue())),
            worklet.metronomeEnabled.catchupAndSubscribe(owner => this.#metronomeEnabled.setValue(owner.getValue())),
            worklet.markerState.catchupAndSubscribe(owner => this.#markerState.setValue(owner.getValue())),
            this.metronomeEnabled.catchupAndSubscribe(owner => worklet.metronomeEnabled.setValue(owner.getValue()))
        )
    }

    assertWorklet(): void {this.#worklet.unwrap("No worklet available")}

    releaseWorklet(): void {
        this.#lifecycle.terminate()
        this.#worklet.ifSome(worklet => worklet.terminate())
        this.#worklet = Option.None
    }

    play(): void {this.#worklet.ifSome(worklet => worklet.play())}
    stop(reset: boolean = false): void {this.#worklet.ifSome(worklet => worklet.stop(reset))}
    setPosition(position: ppqn): void {this.#worklet.ifSome(worklet => worklet.setPosition(position))}
    startRecording(countIn: boolean): void {this.#worklet.ifSome(worklet => worklet.startRecording(countIn))}
    stopRecording(): void {this.#worklet.ifSome(worklet => worklet.stopRecording())}

    get position(): ObservableValue<ppqn> {return this.#position}
    get isPlaying(): ObservableValue<boolean> {return this.#isPlaying}
    get isRecording(): ObservableValue<boolean> {return this.#isRecording}
    get isCountingIn(): ObservableValue<boolean> {return this.#isCountingIn}
    get metronomeEnabled(): MutableObservableValue<boolean> {return this.#metronomeEnabled}
    get playbackTimestamp(): ObservableValue<ppqn> {return this.#playbackTimestamp}
    get countInBeatsTotal(): ObservableValue<int> {return this.#countInBeatsTotal}
    get countInBeatsRemaining(): ObservableValue<int> {return this.#countInBeatsRemaining}
    get markerState(): DefaultObservableValue<Nullable<[UUID.Bytes, int]>> {return this.#markerState}
    get project(): Project {return this.#worklet.unwrap("No worklet to get project").project}

    isReady(): Promise<void> {return this.#worklet.mapOr(worklet => worklet.isReady(), Promise.resolve())}
    queryLoadingComplete(): Promise<boolean> {
        return this.#worklet.mapOr(worklet => worklet.queryLoadingComplete(), Promise.resolve(false))
    }
    panic(): void {this.#worklet.ifSome(worklet => worklet.panic())}
    sampleRate(): number {return this.#worklet.isEmpty() ? 44_100 : this.#worklet.unwrap().context.sampleRate}
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription {
        return this.#worklet.unwrap("No worklet to subscribeClipNotification").subscribeClipNotification(observer)
    }
    subscribeNotes(observer: Observer<NoteSignal>): Subscription {
        return this.#worklet.unwrap("No worklet to subscribeNotes").subscribeNotes(observer)
    }
    ignoreNoteRegion(uuid: UUID.Bytes): void {
        this.#worklet.unwrap("No worklet to ignoreNoteRegion").ignoreNoteRegion(uuid)
    }
    noteSignal(signal: NoteSignal): void {
        this.#worklet.unwrap("No worklet to noteOn").noteSignal(signal)
    }
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Bytes>): void {
        this.#worklet.unwrap("No worklet to scheduleClipPlay").scheduleClipPlay(clipIds)
    }
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Bytes>): void {
        this.#worklet.unwrap("No worklet to scheduleClipStop").scheduleClipStop(trackIds)
    }

    terminate(): void {
        this.releaseWorklet()
        this.#terminator.terminate()
    }
}