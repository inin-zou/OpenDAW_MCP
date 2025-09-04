import {Sample} from "@opendaw/studio-adapters"
import {ProjectMeta} from "@opendaw/studio-core"

export type StudioSignal =
    | {
    type: "reset-peaks"
} | {
    type: "import-sample", sample: Sample
} | {
    type: "delete-project", meta: ProjectMeta
}