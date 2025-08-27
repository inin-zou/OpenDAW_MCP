import {ppqn} from "@opendaw/lib-dsp"
import {
    byte,
    int,
    Nullable,
    ObservableValue,
    Observer,
    Subscription,
    Terminable,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {ClipNotification} from "@opendaw/studio-adapters"
import {Project} from "./Project"

export type NoteTrigger =
    | { type: "note-on", uuid: UUID.Format, pitch: byte, velocity: unitValue }
    | { type: "note-off", uuid: UUID.Format, pitch: byte }

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
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void
    noteOff(uuid: UUID.Format, pitch: byte): void
    subscribeNotes(observer: Observer<NoteTrigger>): Subscription
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