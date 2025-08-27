import {SampleManager} from "@opendaw/studio-adapters"
import {Project} from "../Project"
import {Worklets} from "../Worklets"

export interface RecordingContext {
    project: Project
    worklets: Worklets
    audioContext: AudioContext
    sampleManager: SampleManager
}