import {SampleManager} from "@opendaw/studio-adapters"
import {Project} from "../Project"
import {AudioWorklets} from "../AudioWorklets"

export interface RecordingContext {
    project: Project
    worklets: AudioWorklets
    audioContext: AudioContext
    sampleManager: SampleManager
}