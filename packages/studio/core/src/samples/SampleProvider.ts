import {Progress, UUID} from "@opendaw/lib-std"
import {AudioData, SampleMetaData} from "@opendaw/studio-adapters"

export interface SampleProvider {
    fetch(uuid: UUID.Bytes, progress: Progress.Handler): Promise<[AudioData, SampleMetaData]>
}