import {int, Nullable, Terminable, UUID} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {AudioData} from "./audio/AudioData"
import {ClipSequencingUpdates} from "./ClipNotifications"
import {NoteSignal} from "./NoteSignal"

export interface EngineCommands extends Terminable {
    play(): void
    stop(reset: boolean): void
    setPosition(position: ppqn): void
    startRecording(countIn: boolean): void
    stopRecording(): void

    setMetronomeEnabled(enabled: boolean): void
    queryLoadingComplete(): Promise<boolean>
    // throws a test error while processing audio
    panic(): void
    // feeds a note request into an audio-unit identified by uuid
    noteSignal(signal: NoteSignal): void
    ignoreNoteRegion(uuid: UUID.Bytes): void
    // timeline clip playback management
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Bytes>): void
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Bytes>): void
}

export interface EngineToClient {
    log(message: string): void
    fetchAudio(uuid: UUID.Bytes): Promise<AudioData>
    notifyClipSequenceChanges(changes: ClipSequencingUpdates): void
    switchMarkerState(state: Nullable<[UUID.Bytes, int]>): void
    ready(): void
}