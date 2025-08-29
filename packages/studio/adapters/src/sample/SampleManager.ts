import {UUID} from "@opendaw/lib-std"
import {SampleLoader} from "./SampleLoader"

export interface SampleManager {
    getOrCreate(uuid: UUID.Format): SampleLoader
    record(loader: SampleLoader): void
    invalidate(uuid: UUID.Format): void
    remove(uuid: UUID.Format): void
}