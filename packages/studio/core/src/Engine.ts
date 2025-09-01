import {ppqn} from "@opendaw/lib-dsp"
import {int, Nullable, ObservableValue, Observer, Subscription, Terminable, UUID} from "@opendaw/lib-std"
import {ClipNotification, NoteSignal} from "@opendaw/studio-adapters"
import {Project} from "./Project"

export interface Engine extends Terminable {
    play(): void
    stop(): void
    setPosition(position: ppqn): void
    startRecording(countIn: boolean): void
    stopRecording(): void
    isReady(): Promise<void>
    queryLoadingComplete(): Promise<boolean>
    stop(): void
    panic(): void
    noteSignal(signal: NoteSignal): void
    subscribeNotes(observer: Observer<NoteSignal>): Subscription
    ignoreNoteRegion(uuid: UUID.Format): void
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription

    get position(): ObservableValue<ppqn>
    get isPlaying(): ObservableValue<boolean>
    get isRecording(): ObservableValue<boolean>
    get isCountingIn(): ObservableValue<boolean>
    get metronomeEnabled(): ObservableValue<boolean>
    get playbackTimestamp(): ObservableValue<ppqn>
    get countInBeatsTotal(): ObservableValue<int>
    get countInBeatsRemaining(): ObservableValue<number>
    get markerState(): ObservableValue<Nullable<[UUID.Format, int]>>
    get project(): Project
}