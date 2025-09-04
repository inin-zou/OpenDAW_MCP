import {
    ByteArrayInput,
    int,
    Notifier,
    Observer,
    Option,
    Progress,
    Subscription,
    Terminable,
    UUID
} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Peaks, SamplePeaks} from "@opendaw/lib-fusion"
import {AudioData, SampleLoader, SampleLoaderState, SampleMetaData} from "@opendaw/studio-adapters"
import {WorkerAgents} from "../WorkerAgents"
import {MainThreadSampleManager} from "./MainThreadSampleManager"
import {SampleStorage} from "./SampleStorage"

export class MainThreadSampleLoader implements SampleLoader {
    readonly #manager: MainThreadSampleManager

    readonly #uuid: UUID.Format
    readonly #notifier: Notifier<SampleLoaderState>

    #meta: Option<SampleMetaData> = Option.None
    #data: Option<AudioData> = Option.None
    #peaks: Option<Peaks> = Option.None
    #state: SampleLoaderState = {type: "progress", progress: 0.0}
    #version: int = 0

    constructor(manager: MainThreadSampleManager, uuid: UUID.Format) {
        this.#manager = manager
        this.#uuid = uuid

        this.#notifier = new Notifier<SampleLoaderState>()
        this.#get()
    }

    invalidate(): void {
        this.#state = {type: "progress", progress: 0.0}
        this.#meta = Option.None
        this.#data = Option.None
        this.#peaks = Option.None
        this.#version++
        this.#get()
    }

    subscribe(observer: Observer<SampleLoaderState>): Subscription {
        if (this.#state.type === "loaded") {
            observer(this.#state)
            return Terminable.Empty
        }
        return this.#notifier.subscribe(observer)
    }

    get uuid(): UUID.Format {return this.#uuid}
    get data(): Option<AudioData> {return this.#data}
    get meta(): Option<SampleMetaData> {return this.#meta}
    get peaks(): Option<Peaks> {return this.#peaks}
    get state(): SampleLoaderState {return this.#state}

    toString(): string {return `{MainThreadSampleLoader}`}

    #setState(value: SampleLoaderState): void {
        this.#state = value
        this.#notifier.notify(this.#state)
    }

    #get(): void {
        let version = this.#version
        SampleStorage.load(this.#uuid, this.#manager.context)
            .then(
                ([data, peaks, meta]) => {
                    if (this.#version !== version) {
                        console.warn(`Ignore obsolete version: ${this.#version} / ${version}`)
                        return
                    }
                    this.#data = Option.wrap(data)
                    this.#meta = Option.wrap(meta)
                    this.#peaks = Option.wrap(peaks)
                    this.#setState({type: "loaded"})
                },
                (error: any) => {
                    if (error instanceof Error && error.message.startsWith("timeoout")) {
                        this.#setState({type: "error", reason: error.message})
                        return console.warn(`Sample ${UUID.toString(this.#uuid)} timed out.`)
                    } else {
                        return this.#fetch()
                    }
                })
    }

    async #fetch(): Promise<void> {
        let version: int = this.#version
        const [fetchProgress, peakProgress] = Progress.split(progress => this.#setState({
            type: "progress",
            progress: 0.1 + 0.9 * progress
        }), 2)
        const fetchResult = await Promises.tryCatch(this.#manager.fetch(this.#uuid, fetchProgress))
        if (this.#version !== version) {return}
        if (fetchResult.status === "rejected") {
            console.warn(fetchResult.error)
            this.#setState({type: "error", reason: "Error: N/A"})
            return
        }
        const [audio, meta] = fetchResult.value
        const shifts = SamplePeaks.findBestFit(audio.numberOfFrames)
        const peaks = await WorkerAgents.Peak.generateAsync(
            peakProgress,
            shifts,
            audio.frames,
            audio.numberOfFrames,
            audio.numberOfChannels) as ArrayBuffer
        const storeResult = await Promises.tryCatch(SampleStorage.store(this.#uuid, audio, peaks, meta))
        if (this.#version !== version) {return}
        if (storeResult.status === "resolved") {
            this.#data = Option.wrap(audio)
            this.#meta = Option.wrap(meta)
            this.#peaks = Option.wrap(SamplePeaks.from(new ByteArrayInput(peaks)))
            this.#setState({type: "loaded"})
        } else {
            console.warn(storeResult.error)
            this.#setState({type: "error", reason: "N/A"})
        }
    }
}