import {Progress, UUID} from "@opendaw/lib-std"
import {Sample} from "@opendaw/studio-adapters"

export type SampleImporter = {
    importSample(sample: {
        uuid: UUID.Bytes,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler?: Progress.Handler
    }): Promise<Sample>
}