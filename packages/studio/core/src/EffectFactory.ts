import {EffectPointerType, IconSymbol} from "@opendaw/studio-adapters"
import {Field} from "@opendaw/lib-box"
import {int} from "@opendaw/lib-std"
import {Project} from "./project/Project"
import {EffectBox} from "./EffectBox"

export interface EffectFactory {
    get defaultName(): string
    get defaultIcon(): IconSymbol
    get description(): string
    get separatorBefore(): boolean
    get type(): "audio" | "midi"

    create(project: Project, unit: Field<EffectPointerType>, index: int): EffectBox
}