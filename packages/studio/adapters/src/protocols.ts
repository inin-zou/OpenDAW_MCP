import {byte, int, Nullable, Terminable, unitValue, UUID} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {AudioData} from "./audio/AudioData"
import {ClipSequencingUpdates} from "./ClipNotifications"

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
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void
    noteOff(uuid: UUID.Format, pitch: byte): void
    ignoreNoteRegion(uuid: UUID.Format): void
    // timeline clip playback management
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void
}

export interface EngineToClient {
    log(message: string): void
    fetchAudio(uuid: UUID.Format): Promise<AudioData>
    notifyClipSequenceChanges(changes: ClipSequencingUpdates): void
    switchMarkerState(state: Nullable<[UUID.Format, int]>): void
    ready(): void
}