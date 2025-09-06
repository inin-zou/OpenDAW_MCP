import {SampleApi} from "@/service/SampleApi"
import {encodeWavFloat, SampleStorage} from "@opendaw/studio-core"
import {CloudStorageHandler} from "@/clouds/CloudStorageHandler"
import {Sample} from "@opendaw/studio-adapters"
import {Arrays, Procedure, TimeSpan, UUID} from "@opendaw/lib-std"
import {Promises, Wait} from "@opendaw/lib-runtime"

export namespace CloudSync {
    const SamplePath = "samples"
    const CatalogPath = SamplePath + "/index.json"

    const compareFn = ({uuid: a}: Sample, {uuid: b}: Sample) => a === b
    export const run = async (cloudHandler: CloudStorageHandler, audioContext: AudioContext, log: Procedure<string>) => {
        log("Syncing with cloud...")
        await Wait.timeSpan(TimeSpan.seconds(1))
        const excludeSamples: ReadonlyArray<Sample> = await SampleApi.all()
        log(`Found ${excludeSamples.length} openDAW samples.`)
        await Wait.timeSpan(TimeSpan.seconds(1))
        const localSamples: ReadonlyArray<Sample> = await SampleStorage.list()
        log(`Found ${localSamples.length} local samples.`)
        await Wait.timeSpan(TimeSpan.seconds(1))
        const maybeUnsyncedSamples = Arrays.subtract(localSamples, excludeSamples, compareFn)
        const cloudSamples: ReadonlyArray<Sample> = await cloudHandler.download(CatalogPath)
            .then(json => JSON.parse(new TextDecoder().decode(json)), () => Arrays.empty())
        const unsyncedSamples = Arrays.subtract(maybeUnsyncedSamples, cloudSamples, compareFn)
        if (unsyncedSamples.length === 0) {
            log("No unsynced samples found.")
            await Wait.timeSpan(TimeSpan.seconds(3))
            return
        }
        log(`Synchronize ${unsyncedSamples.length} unsynced samples from storage...`)
        await Wait.timeSpan(TimeSpan.seconds(3))
        const uploadedSampleResults: ReadonlyArray<PromiseSettledResult<Sample>> =
            await Promises.allSettledWithLimit(unsyncedSamples.map(sample =>
                async () => {
                    log(`uploading '${sample.name}'`)
                    const file = await SampleStorage.load(UUID.parse(sample.uuid), audioContext)
                        .then(([{frames: channels, numberOfChannels, numberOfFrames: numFrames, sampleRate}]) =>
                            encodeWavFloat({channels, numberOfChannels, numFrames, sampleRate}))
                    await cloudHandler.upload(`${SamplePath}/${sample.uuid}`, file)
                    return sample
                }))
        log(`Synchronize index.json...`)
        await Wait.timeSpan(TimeSpan.seconds(3))
        const catalog: Array<Sample> = Arrays.merge(cloudSamples, uploadedSampleResults
            .filter(result => result.status === "fulfilled")
            .map(result => result.value), compareFn)
        const jsonString = JSON.stringify(catalog, null, 2)
        console.debug(jsonString)
        const buffer = new TextEncoder().encode(jsonString).buffer
        await cloudHandler.upload(`${SamplePath}/index.json`, buffer)
        log("Everything is up to date.")
        await Wait.timeSpan(TimeSpan.seconds(3))
    }
}