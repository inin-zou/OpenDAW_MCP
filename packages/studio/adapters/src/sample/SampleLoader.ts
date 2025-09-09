import {Observer, Option, Subscription, UUID} from "@opendaw/lib-std"
import {Peaks} from "@opendaw/lib-fusion"
import {AudioData} from "../audio/AudioData"
import {SampleLoaderState} from "./SampleLoaderState"

export interface SampleLoader {
    get data(): Option<AudioData>
    get peaks(): Option<Peaks>
    get uuid(): UUID.Bytes
    get state(): SampleLoaderState
    invalidate(): void
    subscribe(observer: Observer<SampleLoaderState>): Subscription
}