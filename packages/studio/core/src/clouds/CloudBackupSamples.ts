import {Arrays, Errors, panic, Procedure, Progress, RuntimeNotifier, UUID} from "@opendaw/lib-std"
import {network, Promises} from "@opendaw/lib-runtime"
import {SamplePeaks} from "@opendaw/lib-fusion"
import {AudioData, Sample} from "@opendaw/studio-adapters"
import {OpenSampleAPI} from "../samples/OpenSampleAPI"
import {SampleStorage} from "../samples/SampleStorage"
import {CloudHandler} from "./CloudHandler"
import {WorkerAgents} from "../WorkerAgents"
import {WavFile} from "../WavFile"

type SampleDomains = Record<"stock" | "local" | "cloud", ReadonlyArray<Sample>>

export class CloudBackupSamples {
    static readonly RemotePath = "samples"
    static readonly RemoteCatalogPath = `${this.RemotePath}/index.json`
    static readonly areSamplesEqual = ({uuid: a}: Sample, {uuid: b}: Sample) => a === b

    static createPath(uuid: UUID.String): string {return `${this.RemotePath}/${uuid}.wav`}

    static async start(cloudHandler: CloudHandler,
                       progress: Progress.Handler,
                       log: Procedure<string>) {
        log("Collecting all sample domains...")
        const [stock, local, cloud] = await Promise.all([
            OpenSampleAPI.get().all(),
            SampleStorage.listSamples(),
            cloudHandler.download(CloudBackupSamples.RemoteCatalogPath)
                .then(json => JSON.parse(new TextDecoder().decode(json)))
                .catch(reason => reason instanceof Errors.FileNotFound ? Arrays.empty() : panic(reason))
        ])
        return new CloudBackupSamples(cloudHandler, {stock, local, cloud}, log).#start(progress)
    }

    readonly #cloudHandler: CloudHandler
    readonly #sampleDomains: SampleDomains
    readonly #log: Procedure<string>

    private constructor(cloudHandler: CloudHandler,
                        sampleDomains: SampleDomains,
                        log: Procedure<string>) {
        this.#cloudHandler = cloudHandler
        this.#sampleDomains = sampleDomains
        this.#log = log
    }

    async #start(progress: Progress.Handler) {
        const trashed = await SampleStorage.loadTrashedIds()
        const [uploadProgress, trashProgress, downloadProgress] = Progress.splitWithWeights(progress, [0.45, 0.10, 0.45])
        await this.#upload(uploadProgress)
        await this.#trash(trashed, trashProgress)
        await this.#download(trashed, downloadProgress)
    }

    async #upload(progress: Progress.Handler) {
        const {stock, local, cloud} = this.#sampleDomains
        const maybeUnsyncedSamples = Arrays.subtract(local, stock, CloudBackupSamples.areSamplesEqual)
        const unsyncedSamples = Arrays.subtract(maybeUnsyncedSamples, cloud, CloudBackupSamples.areSamplesEqual)
        if (unsyncedSamples.length === 0) {
            this.#log("No unsynced samples found.")
            progress(1.0)
            return
        }
        const uploadedSamples = await Promises.sequentialAll(unsyncedSamples.map((sample, index, {length}) =>
            async () => {
                progress((index + 1) / length)
                this.#log(`Uploading sample '${sample.name}'`)
                const arrayBuffer = await SampleStorage.loadSample(UUID.parse(sample.uuid))
                    .then(([{frames: channels, numberOfChannels, numberOfFrames: numFrames, sampleRate}]) =>
                        WavFile.encodeFloats({channels, numberOfChannels, numFrames, sampleRate}))
                await this.#cloudHandler.upload(CloudBackupSamples.createPath(sample.uuid), arrayBuffer)
                return sample
            }))
        const catalog: Array<Sample> = Arrays.merge(cloud, uploadedSamples, CloudBackupSamples.areSamplesEqual)
        await this.#uploadCatalog(catalog)
        progress(1.0)
    }

    async #trash(trashed: ReadonlyArray<UUID.String>, progress: Progress.Handler) {
        const {cloud} = this.#sampleDomains
        const obsolete = Arrays.intersect(cloud, trashed, (sample, uuid) => sample.uuid === uuid)
        if (obsolete.length === 0) {
            progress(1.0)
            return
        }
        const approved = await RuntimeNotifier.approve({
            headline: "Delete Samples?",
            message: `Found ${obsolete.length} locally deleted samples. Delete from cloud as well?`,
            approveText: "Yes",
            cancelText: "No"
        })
        if (!approved) {
            progress(1.0)
            return
        }
        const result: ReadonlyArray<Sample> = await Promises.sequentialAll(
            obsolete.map((sample, index, {length}) => async () => {
                progress((index + 1) / length)
                this.#log(`Deleting '${sample.name}'`)
                await this.#cloudHandler.delete(CloudBackupSamples.createPath(sample.uuid))
                return sample
            }))
        const catalog = cloud.slice()
        result.forEach((sample) => Arrays.removeIf(catalog, ({uuid}) => sample.uuid === uuid))
        await this.#uploadCatalog(catalog)
        progress(1.0)
    }

    async #download(trashed: ReadonlyArray<UUID.String>, progress: Progress.Handler) {
        const {cloud, local} = this.#sampleDomains
        const missingLocally = Arrays.subtract(cloud, local, CloudBackupSamples.areSamplesEqual)
        const download = Arrays.subtract(missingLocally, trashed, (sample, uuid) => sample.uuid === uuid)
        if (download.length === 0) {
            this.#log("No samples to download.")
            progress(1.0)
            return
        }
        await Promises.sequentialAll(download.map((sample, index, {length}) =>
            async () => {
                progress((index + 1) / length)
                this.#log(`Downloading sample '${sample.name}'`)
                const path = CloudBackupSamples.createPath(sample.uuid)
                const buffer = await Promises.guardedRetry(() => this.#cloudHandler.download(path), network.DefaultRetry)
                const waveAudio = WavFile.decodeFloats(buffer)
                const audioData: AudioData = {
                    sampleRate: waveAudio.sampleRate,
                    numberOfFrames: waveAudio.numFrames,
                    numberOfChannels: waveAudio.channels.length,
                    frames: waveAudio.channels
                }
                const shifts = SamplePeaks.findBestFit(audioData.numberOfFrames)
                const peaks = await WorkerAgents.Peak.generateAsync(
                    Progress.Empty,
                    shifts,
                    audioData.frames,
                    audioData.numberOfFrames,
                    audioData.numberOfChannels) as ArrayBuffer
                await SampleStorage.saveSample(UUID.parse(sample.uuid), audioData, peaks, sample)
                return sample
            }))
        this.#log("Download samples complete.")
        progress(1.0)
    }

    async #uploadCatalog(catalog: ReadonlyArray<Sample>) {
        this.#log("Uploading sample catalog...")
        const jsonString = JSON.stringify(catalog, null, 2)
        const buffer = new TextEncoder().encode(jsonString).buffer
        return this.#cloudHandler.upload(CloudBackupSamples.RemoteCatalogPath, buffer)
    }
}