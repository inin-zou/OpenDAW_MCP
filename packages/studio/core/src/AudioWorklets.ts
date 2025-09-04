import {asDefined, int} from "@opendaw/lib-std"
import {ExportStemsConfiguration, RingBuffer} from "@opendaw/studio-adapters"
import {Project} from "./project/Project"
import {EngineWorklet} from "./EngineWorklet"
import {MeterWorklet} from "./MeterWorklet"
import {RecordingWorklet} from "./RecordingWorklet"
import {RenderQuantum} from "./RenderQuantum"

const WorkletsUrl = new URL("./processors.js", import.meta.url)

console.debug("WorkletsUrl", WorkletsUrl)

export class AudioWorklets {
    static async install(context: BaseAudioContext): Promise<AudioWorklets> {
        return context.audioWorklet.addModule(WorkletsUrl).then(() => {
            const worklets = new AudioWorklets(context)
            this.#map.set(context, worklets)
            return worklets
        })
    }

    static get(context: BaseAudioContext): AudioWorklets {return asDefined(this.#map.get(context), "Worklets not installed")}

    static #map: WeakMap<BaseAudioContext, AudioWorklets> = new WeakMap<AudioContext, AudioWorklets>()

    readonly #context: BaseAudioContext

    constructor(context: BaseAudioContext) {this.#context = context}

    get context(): BaseAudioContext {return this.#context}

    createMeter(numberOfChannels: int): MeterWorklet {
        return new MeterWorklet(this.#context, numberOfChannels)
    }

    createEngine(project: Project, exportConfiguration?: ExportStemsConfiguration): EngineWorklet {
        return new EngineWorklet(this.#context, project, exportConfiguration)
    }

    createRecording(numberOfChannels: int, numChunks: int, outputLatency: number): RecordingWorklet {
        const audioBytes = numberOfChannels * numChunks * RenderQuantum * Float32Array.BYTES_PER_ELEMENT
        const pointerBytes = Int32Array.BYTES_PER_ELEMENT * 2
        const sab = new SharedArrayBuffer(audioBytes + pointerBytes)
        const buffer: RingBuffer.Config = {sab, numChunks, numberOfChannels, bufferSize: RenderQuantum}
        return new RecordingWorklet(this.#context, buffer, outputLatency)
    }
}