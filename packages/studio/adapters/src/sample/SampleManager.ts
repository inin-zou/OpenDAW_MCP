import {UUID} from "@opendaw/lib-std"
import {SampleLoader} from "./SampleLoader"

export interface SampleManager {
    getOrCreate(uuid: UUID.Bytes): SampleLoader
    record(loader: SampleLoader): void
    invalidate(uuid: UUID.Bytes): void
    remove(uuid: UUID.Bytes): void
}