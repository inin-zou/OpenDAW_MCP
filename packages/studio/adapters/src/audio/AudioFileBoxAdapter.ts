import {AudioFileBox} from "@opendaw/studio-boxes"
import {Option, UUID} from "@opendaw/lib-std"
import {Peaks} from "@opendaw/lib-fusion"
import {AudioData} from "./AudioData"
import {Address} from "@opendaw/lib-box"
import {SampleLoader} from "../sample/SampleLoader"
import {BoxAdaptersContext} from "../BoxAdaptersContext"
import {BoxAdapter} from "../BoxAdapter"

export class AudioFileBoxAdapter implements BoxAdapter {
    readonly #context: BoxAdaptersContext
    readonly #box: AudioFileBox

    constructor(context: BoxAdaptersContext, box: AudioFileBox) {
        this.#context = context
        this.#box = box
    }

    get box(): AudioFileBox {return this.#box}
    get uuid(): UUID.Bytes {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get startInSeconds(): number {return this.#box.startInSeconds.getValue()}
    get endInSeconds(): number {return this.#box.endInSeconds.getValue()}
    get data(): Option<AudioData> {return this.getOrCreateLoader().data}
    get peaks(): Option<Peaks> {return this.getOrCreateLoader().peaks}

    getOrCreateLoader(): SampleLoader {
        return this.#context.sampleManager.getOrCreate(this.#box.address.uuid)
    }

    terminate(): void {}
}