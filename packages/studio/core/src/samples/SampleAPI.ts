import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {Procedure, unitValue, UUID} from "@opendaw/lib-std"

export interface SampleAPI {
    all(): Promise<ReadonlyArray<Sample>>
    get(uuid: UUID.Bytes): Promise<Sample>
    load(context: AudioContext, uuid: UUID.Bytes, progress: Procedure<unitValue>): Promise<[AudioData, Sample]>
    upload(arrayBuffer: ArrayBuffer, metaData: SampleMetaData): Promise<void>
    allowsUpload(): boolean
}