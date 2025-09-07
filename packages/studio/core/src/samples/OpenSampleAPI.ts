import {
    Arrays,
    asDefined,
    DefaultObservableValue,
    Lazy,
    panic,
    Procedure,
    RuntimeNotifier,
    tryCatch,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {network, Promises} from "@opendaw/lib-runtime"
import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {SampleAPI} from "@opendaw/studio-core"

const username = "openDAW"
const password = "prototype"
const base64Credentials = btoa(`${username}:${password}`)
const headers: RequestInit = {
    method: "GET",
    headers: {"Authorization": `Basic ${base64Credentials}`},
    credentials: "include"
}

// Standard openDAW samples (considered to be non-removable)
export class OpenSampleAPI implements SampleAPI {
    static readonly ApiRoot = "https://api.opendaw.studio/samples"
    static readonly FileRoot = "https://assets.opendaw.studio/samples"

    @Lazy
    static get(): OpenSampleAPI {return new OpenSampleAPI()}

    static fromAudioBuffer(buffer: AudioBuffer): AudioData {
        return {
            frames: Arrays.create(channel => buffer.getChannelData(channel), buffer.numberOfChannels),
            sampleRate: buffer.sampleRate,
            numberOfFrames: buffer.length,
            numberOfChannels: buffer.numberOfChannels
        }
    }

    private constructor() {}

    async all(): Promise<ReadonlyArray<Sample>> {
        return Promises.retry(() => fetch(`${OpenSampleAPI.ApiRoot}/list.php`, headers)
            .then(x => x.json(), () => []))
    }

    async get(uuid: UUID.Format): Promise<Sample> {
        const url = `${OpenSampleAPI.ApiRoot}/get.php?uuid=${UUID.toString(uuid)}`
        const sample: Sample = await Promises.retry(() => network.limitFetch(url, headers)
            .then(x => x.json()))
            .then(x => {if ("error" in x) {return panic(x.error)} else {return x}})
        return Object.freeze({...sample, cloud: "cloud:openDAW"})
    }

    async load(context: AudioContext, uuid: UUID.Format, progress: Procedure<unitValue>): Promise<[AudioData, Sample]> {
        console.debug(`load ${UUID.toString(uuid)}`)
        return this.get(uuid)
            .then(({uuid, name, bpm}) => Promises.retry(() => network
                .limitFetch(`${OpenSampleAPI.FileRoot}/${uuid}`, headers))
                .then(response => {
                    const total = parseInt(response.headers.get("Content-Length") ?? "0")
                    let loaded = 0
                    return new Promise<ArrayBuffer>((resolve, reject) => {
                        const reader = asDefined(response.body, "No body in response").getReader()
                        const chunks: Array<Uint8Array> = []
                        const nextChunk = ({done, value}: ReadableStreamReadResult<Uint8Array>) => {
                            if (done) {
                                resolve(new Blob(chunks as Array<BlobPart>).arrayBuffer())
                            } else {
                                chunks.push(value)
                                loaded += value.length
                                progress(loaded / total)
                                reader.read().then(nextChunk, reject)
                            }
                        }
                        reader.read().then(nextChunk, reject)
                    })
                })
                .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
                .then(audioBuffer => ([OpenSampleAPI.fromAudioBuffer(audioBuffer), {
                    uuid,
                    bpm,
                    name,
                    duration: audioBuffer.duration,
                    sample_rate: audioBuffer.sampleRate
                }])))
    }

    async upload(arrayBuffer: ArrayBuffer, metaData: SampleMetaData): Promise<void> {
        const progress = new DefaultObservableValue(0.0)
        const dialog = RuntimeNotifier.progress({headline: "Uploading", progress})
        const formData = new FormData()
        Object.entries(metaData).forEach(([key, value]) => formData.set(key, String(value)))
        const params = new URLSearchParams(location.search)
        const accessKey = asDefined(params.get("access-key"), "Cannot upload without access-key.")
        formData.set("key", accessKey)
        formData.append("file", new Blob([arrayBuffer]))
        console.log("upload data", Array.from(formData.entries()), arrayBuffer.byteLength)
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener("progress", (event: ProgressEvent) => {
            if (event.lengthComputable) {
                progress.setValue(event.loaded / event.total)
            }
        })
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                dialog.terminate()
                if (xhr.status === 200) {
                    RuntimeNotifier.info({message: xhr.responseText})
                } else {
                    const {
                        status,
                        value
                    } = tryCatch(() => JSON.parse(xhr.responseText).message ?? "Unknown error message")
                    RuntimeNotifier.info({
                        headline: "Upload Failure",
                        message: status === "success" ? value : "Unknown error"
                    })
                }
            }
        }
        xhr.open("POST", `${OpenSampleAPI.ApiRoot}/upload.php`, true)
        xhr.setRequestHeader("Authorization", `Basic ${base64Credentials}`)
        xhr.send(formData)
    }

    allowsUpload(): boolean {return false}
}