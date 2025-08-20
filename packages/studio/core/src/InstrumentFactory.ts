import {IconSymbol, TrackType} from "@opendaw/studio-adapters"
import {BoxGraph, Field} from "@opendaw/lib-box"

import {InstrumentBox} from "./InstrumentBox"
import {Pointers} from "@opendaw/studio-enums"

export interface InstrumentFactory {
    defaultName: string
    defaultIcon: IconSymbol
    description: string
    trackType: TrackType
    create: (boxGraph: BoxGraph,
             host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
             name: string,
             icon: IconSymbol) => InstrumentBox
}