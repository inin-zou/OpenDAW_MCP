import {Peaks} from "@opendaw/lib-fusion"
import {AudioData, EngineToClient, SampleLoader, SampleLoaderState, SampleManager} from "@opendaw/studio-adapters"
import {Observer, Option, SortedSet, Subscription, Terminable, UUID} from "@opendaw/lib-std"

class AudioLoaderWorklet implements SampleLoader {
    readonly peaks: Option<Peaks> = Option.None
    readonly #state: SampleLoaderState = {type: "idle"}

    #data: Option<AudioData> = Option.None

    constructor(readonly uuid: UUID.Bytes, readonly engineToClient: EngineToClient) {
        engineToClient.fetchAudio(uuid).then((data) => this.#data = Option.wrap(data))
    }

    get data(): Option<AudioData> {return this.#data}
    get state(): SampleLoaderState {return this.#state}

    subscribe(_observer: Observer<SampleLoaderState>): Subscription {return Terminable.Empty}
    invalidate(): void {}

    toString(): string {return `{AudioLoaderWorklet}`}
}

export class AudioManagerWorklet implements SampleManager {
    readonly #engineToClient: EngineToClient
    readonly #set: SortedSet<UUID.Bytes, SampleLoader>

    constructor(engineToClient: EngineToClient) {
        this.#engineToClient = engineToClient
        this.#set = UUID.newSet<SampleLoader>(handler => handler.uuid)
    }

    record(_loader: SampleLoader): void {}

    getOrCreate(uuid: UUID.Bytes): SampleLoader {
        return this.#set.getOrCreate(uuid, uuid => new AudioLoaderWorklet(uuid, this.#engineToClient))
    }

    remove(_uuid: UUID.Bytes) {}
    invalidate(_uuid: UUID.Bytes) {}
}