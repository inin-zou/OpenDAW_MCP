import {TimelineBox} from "@opendaw/studio-boxes"
import {UUID} from "@opendaw/lib-std"
import {Address} from "@opendaw/lib-box"
import {BoxAdapter} from "../BoxAdapter"
import {MarkerTrackAdapter} from "./MarkerTrackAdapter"
import {BoxAdaptersContext} from "../BoxAdaptersContext"

export class TimelineBoxAdapter implements BoxAdapter {
    readonly #box: TimelineBox
    readonly #markerTrack: MarkerTrackAdapter

    constructor(context: BoxAdaptersContext, box: TimelineBox) {
        this.#box = box
        this.#markerTrack = new MarkerTrackAdapter(context, this.#box.markerTrack)
    }

    terminate(): void {}

    get box(): TimelineBox {return this.#box}
    get uuid(): UUID.Bytes {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get markerTrack(): MarkerTrackAdapter {return this.#markerTrack}
}