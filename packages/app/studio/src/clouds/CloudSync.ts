import {Arrays, identity, isDefined, Procedure, TimeSpan, tryCatch, UUID} from "@opendaw/lib-std"
import {Promises, Wait} from "@opendaw/lib-runtime"
import {Sample} from "@opendaw/studio-adapters"
import {encodeWavFloat, OpenSampleAPI, ProjectMeta, SampleStorage} from "@opendaw/studio-core"
import {CloudStorageHandler} from "@/clouds/CloudStorageHandler"
import {ProjectStorage} from "@/project/ProjectStorage"

export namespace CloudSync {
    const ProjectsPath = "projects"
    const SamplesPath = "samples"
    const SamplesCatalogPath = SamplesPath + "/index.json"

    // TODO Move Projects to SDK
    // TODO Move Cloud stuff to SDK

    export const syncProjects = async (cloudHandler: CloudStorageHandler,
                                       log: Procedure<string>) => {
        log("Start syncing projects...")
        await Wait.timeSpan(TimeSpan.seconds(1))
        const dropboxResult = await Promises.tryCatch(cloudHandler.list(ProjectsPath))
        const excludeProjects = UUID.newSet<UUID.Format>(identity)
        if (dropboxResult.status === "resolved") {
            excludeProjects.addMany(dropboxResult.value
                .map(fileName => tryCatch(() => UUID.parse(fileName)))
                .filter(result => result.status === "success")
                .map(result => result.value))
        }
        const listResult = await Promises.tryCatch(ProjectStorage.listProjects({includeCover: true}))
        if (listResult.status === "rejected") {
            return log("Failed to list projects.")
        }
        const unsyncedProjects = listResult.value.filter(({uuid}) => !excludeProjects.hasKey(uuid))
        log(`Synchronize ${listResult.value.length} projects...`)
        await Wait.timeSpan(TimeSpan.seconds(1))
        const results = await Promises.allSettledWithLimit(unsyncedProjects
            .map(({uuid, meta, cover}: {
                uuid: UUID.Format
                meta: ProjectMeta
                cover?: ArrayBuffer
            }) => async () => {
                const folder = `${ProjectsPath}/${UUID.toString(uuid)}`
                const projectData = await ProjectStorage.loadProject(uuid)
                const metaJson = new TextEncoder().encode(JSON.stringify(meta)).buffer
                const tasks: Array<Promise<unknown>> = []
                tasks.push(cloudHandler.upload(`${folder}/project.od`, projectData))
                tasks.push(cloudHandler.upload(`${folder}/meta.json`, metaJson))
                if (isDefined(cover)) {
                    tasks.push(cloudHandler.upload(`${ProjectsPath}/${folder}/image.bin`, cover))
                }
                log(`Uploading project '${meta.name}'`)
                await Promise.all(tasks)
            }))
        await Wait.timeSpan(TimeSpan.seconds(2))
        console.log(`${results.filter(result => result.status === "fulfilled").length} successfully uploaded.`)
    }

    export const syncSamples = async (cloudHandler: CloudStorageHandler,
                                      audioContext: AudioContext,
                                      log: Procedure<string>) => {
        const areSamplesEqual = ({uuid: a}: Sample, {uuid: b}: Sample) => a === b
        log("Start syncing samples...")
        await Wait.timeSpan(TimeSpan.seconds(1))
        const excludeSamples: ReadonlyArray<Sample> = await new OpenSampleAPI().all()
        log(`Found ${excludeSamples.length} openDAW samples.`)
        await Wait.timeSpan(TimeSpan.seconds(1))
        const localSamples: ReadonlyArray<Sample> = await SampleStorage.list()
        log(`Found ${localSamples.length} local samples.`)
        await Wait.timeSpan(TimeSpan.seconds(1))
        const maybeUnsyncedSamples = Arrays.subtract(localSamples, excludeSamples, areSamplesEqual)
        const cloudSamples: ReadonlyArray<Sample> = await cloudHandler.download(SamplesCatalogPath)
            .then(json => JSON.parse(new TextDecoder().decode(json)), () => Arrays.empty())
        const unsyncedSamples = Arrays.subtract(maybeUnsyncedSamples, cloudSamples, areSamplesEqual)
        if (unsyncedSamples.length === 0) {
            log("No unsynced samples found.")
            await Wait.timeSpan(TimeSpan.seconds(2))
            return
        }
        log(`Synchronize ${unsyncedSamples.length} unsynced samples from storage...`)
        await Wait.timeSpan(TimeSpan.seconds(2))
        const uploadedSampleResults: ReadonlyArray<PromiseSettledResult<Sample>> =
            await Promises.allSettledWithLimit(unsyncedSamples.map(sample =>
                async () => {
                    log(`uploading '${sample.name}'`)
                    const file = await SampleStorage.load(UUID.parse(sample.uuid), audioContext)
                        .then(([{frames: channels, numberOfChannels, numberOfFrames: numFrames, sampleRate}]) =>
                            encodeWavFloat({channels, numberOfChannels, numFrames, sampleRate}))
                    await cloudHandler.upload(`${SamplesPath}/${sample.uuid}`, file)
                    return sample
                }))
        log(`Synchronize index.json...`)
        await Wait.timeSpan(TimeSpan.seconds(2))
        const catalog: Array<Sample> = Arrays.merge(cloudSamples, uploadedSampleResults
            .filter(result => result.status === "fulfilled")
            .map(result => result.value), areSamplesEqual)
        const jsonString = JSON.stringify(catalog, null, 2)
        console.debug(jsonString)
        const buffer = new TextEncoder().encode(jsonString).buffer
        await cloudHandler.upload(`${SamplesPath}/index.json`, buffer)
        log("Everything is up to date.")
        await Wait.timeSpan(TimeSpan.seconds(2))
    }
}