import {
    ByteArrayInput,
    int,
    Notifier,
    Observer,
    Option,
    Progress,
    Subscription,
    Terminable,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {BPMTools} from "@opendaw/lib-dsp"
import {Peaks, SamplePeaks} from "@opendaw/lib-fusion"
import {
    AudioData,
    mergeChunkPlanes,
    RingBuffer,
    SampleLoader,
    SampleLoaderState,
    SampleMetaData
} from "@opendaw/studio-adapters"
import {SampleStorage} from "./samples/SampleStorage"
import {RenderQuantum} from "./RenderQuantum"
import {WorkerAgents} from "./WorkerAgents"
import {PeaksWriter} from "./PeaksWriter"

export class RecordingWorklet extends AudioWorkletNode implements Terminable, SampleLoader {
    readonly #terminator: Terminator = new Terminator()

    readonly uuid: UUID.Format = UUID.generate()

    readonly #output: Array<ReadonlyArray<Float32Array>>
    readonly #notifier: Notifier<SampleLoaderState>
    readonly #reader: RingBuffer.Reader
    readonly #peakWriter: PeaksWriter

    #data: Option<AudioData> = Option.None
    #peaks: Option<Peaks> = Option.None
    #isRecording: boolean = true
    #limitSamples: int = Number.POSITIVE_INFINITY
    #state: SampleLoaderState = {type: "record"}

    constructor(context: BaseAudioContext, config: RingBuffer.Config, outputLatency: number) {
        super(context, "recording-processor", {
            numberOfInputs: 1,
            channelCount: config.numberOfChannels,
            channelCountMode: "explicit",
            processorOptions: config
        })

        this.#peakWriter = new PeaksWriter(config.numberOfChannels)
        this.#peaks = Option.wrap(this.#peakWriter)
        this.#output = []
        this.#notifier = new Notifier<SampleLoaderState>()
        this.#reader = RingBuffer.reader(config, array => {
            if (this.#isRecording) {
                this.#output.push(array)
                this.#peakWriter.append(array)
                const latencyInSamples = (outputLatency * this.context.sampleRate) | 0
                const need = this.numberOfFrames - latencyInSamples
                if (need >= this.#limitSamples) {
                    this.#finalize().catch(error => console.warn(error))
                }
            }
        })
    }

    own<T extends Terminable>(terminable: T): T {return this.#terminator.own(terminable)}

    limit(count: int): void {this.#limitSamples = count}

    get numberOfFrames(): int {return this.#output.length * RenderQuantum}
    get data(): Option<AudioData> {return this.#data}
    get peaks(): Option<Peaks> {return this.#peaks.isEmpty() ? Option.wrap(this.#peakWriter) : this.#peaks}
    get state(): SampleLoaderState {return this.#state}

    invalidate(): void {}

    subscribe(observer: Observer<SampleLoaderState>): Subscription {
        if (this.#state.type === "loaded") {
            observer(this.#state)
            return Terminable.Empty
        }
        return this.#notifier.subscribe(observer)
    }

    async #finalize() {
        this.#isRecording = false
        this.#reader.stop()
        if (this.#output.length === 0) {return}
        const totalSamples: int = this.#limitSamples
        const sample_rate = this.context.sampleRate
        const numberOfChannels = this.channelCount
        const frames = mergeChunkPlanes(this.#output, RenderQuantum, this.#output.length * RenderQuantum)
            .map(frame => frame.slice(-totalSamples))
        const audioData: AudioData = {
            sampleRate: sample_rate,
            numberOfChannels,
            numberOfFrames: totalSamples,
            frames
        }
        this.#data = Option.wrap(audioData)
        const shifts = SamplePeaks.findBestFit(totalSamples)
        const peaks = await WorkerAgents
            .Peak.generateAsync(Progress.Empty, shifts, frames, totalSamples, numberOfChannels)
        this.#peaks = Option.wrap(SamplePeaks.from(new ByteArrayInput(peaks)))
        const bpm = BPMTools.detect(frames[0], sample_rate)
        const duration = totalSamples / sample_rate
        const meta: SampleMetaData = {name: "Recording", bpm, sample_rate, duration}
        await SampleStorage.store(this.uuid, audioData, peaks as ArrayBuffer, meta)
        this.#setState({type: "loaded"})
        this.terminate()
    }

    terminate(): void {
        this.#reader.stop()
        this.#isRecording = false
        this.#terminator.terminate()
    }

    toString(): string {return `{RecordingWorklet}`}

    #setState(value: SampleLoaderState): void {
        this.#state = value
        this.#notifier.notify(this.#state)
    }
}