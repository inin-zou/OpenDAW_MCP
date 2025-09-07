import {
    Arrays,
    DefaultObservableValue,
    Errors,
    isDefined,
    isUndefined,
    Procedure,
    Progress,
    RuntimeNotifier,
    TimeSpan,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {Promises, Wait} from "@opendaw/lib-runtime"
import {Sample} from "@opendaw/studio-adapters"
import {ProjectStorage} from "../project/ProjectStorage"
import {ProjectMeta} from "../project/ProjectMeta"
import {OpenSampleAPI} from "../samples/OpenSampleAPI"
import {SampleStorage} from "../samples/SampleStorage"
import {encodeWavFloat} from "../Wav"
import {CloudStorageHandler} from "./CloudStorageHandler"

export namespace CloudBackup {
    const ProjectsPath = "projects"
    const ProjectsCatalogPath = `${ProjectsPath}/index.json`
    const SamplesPath = "samples"
    const SamplesCatalogPath = `${SamplesPath}/index.json`

    const shortNotificationTime = TimeSpan.seconds(0.5)
    const longNotificationTime = TimeSpan.seconds(1.0)

    export const fullBackup = async (cloudHandler: CloudStorageHandler,
                                     audioContext: AudioContext) => {
        const progressValue = new DefaultObservableValue<unitValue>(0.0)
        const notification = RuntimeNotifier.progress({headline: "Dropbox Backup", progress: progressValue})
        const [progressSamples, progressProjects] = Progress.split(progress => progressValue.setValue(progress), 2)
        const log = (text: string) => notification.message = text
        const syncSamplesResult = await Promises.tryCatch(
            backupSamples(cloudHandler, audioContext, log, progressSamples))
        if (syncSamplesResult.status === "rejected") {
            notification.terminate()
            return Errors.warn(String(syncSamplesResult.error))
        }
        const syncProjectsResult = await Promises.tryCatch(
            backupProjects(cloudHandler, log, progressProjects))
        if (syncProjectsResult.status === "rejected") {
            notification.terminate()
            return Errors.warn(String(syncProjectsResult.error))
        }
        log("Everything is up to date.")
        await Wait.timeSpan(longNotificationTime)
        notification.terminate()
        progressValue.terminate()
    }

    export const backupSamples = async (cloudHandler: CloudStorageHandler,
                                        audioContext: AudioContext,
                                        log: Procedure<string>,
                                        progress: Progress.Handler) => {
        progress(0.0)
        const [listProgress, uploadProgress] = Progress.split(progress, 2)
        const areSamplesEqual = ({uuid: a}: Sample, {uuid: b}: Sample) => a === b
        log("Start syncing samples...")
        await Wait.timeSpan(shortNotificationTime)
        listProgress(0.25)
        const excludeSamples: ReadonlyArray<Sample> = await OpenSampleAPI.get().all()
        log(`Found ${excludeSamples.length} openDAW samples.`)
        await Wait.timeSpan(shortNotificationTime)
        listProgress(0.50)
        const localSamples: ReadonlyArray<Sample> = await SampleStorage.list()
        log(`Found ${localSamples.length} local samples.`)
        await Wait.timeSpan(shortNotificationTime)
        listProgress(0.75)
        const maybeUnsyncedSamples = Arrays.subtract(localSamples, excludeSamples, areSamplesEqual)
        const cloudSamples: ReadonlyArray<Sample> = await cloudHandler.download(SamplesCatalogPath)
            .then(json => JSON.parse(new TextDecoder().decode(json)), () => Arrays.empty())
        const unsyncedSamples = Arrays.subtract(maybeUnsyncedSamples, cloudSamples, areSamplesEqual)
        if (unsyncedSamples.length === 0) {
            log("No unsynced samples found.")
            await Wait.timeSpan(longNotificationTime)
            progress(1.0)
            return
        }
        log(`Synchronize ${unsyncedSamples.length} unsynced samples from storage...`)
        await Wait.timeSpan(longNotificationTime)
        listProgress(1.0)
        const uploadedSampleResults: ReadonlyArray<PromiseSettledResult<Sample>> =
            await Promises.allSettledWithLimit(unsyncedSamples.map((sample, index, {length}) =>
                async () => {
                    uploadProgress((index + 1) / length)
                    log(`uploading '${sample.name}'`)
                    const file = await SampleStorage.load(UUID.parse(sample.uuid), audioContext)
                        .then(([{frames: channels, numberOfChannels, numberOfFrames: numFrames, sampleRate}]) =>
                            encodeWavFloat({channels, numberOfChannels, numFrames, sampleRate}))
                    await cloudHandler.upload(`${SamplesPath}/${sample.uuid}`, file)
                    return sample
                }))
        log(`Synchronize index.json...`)
        await Wait.timeSpan(longNotificationTime)
        const catalog: Array<Sample> = Arrays.merge(cloudSamples, uploadedSampleResults
            .filter(result => result.status === "fulfilled")
            .map(result => result.value), areSamplesEqual)
        const jsonString = JSON.stringify(catalog, null, 2)
        console.debug(jsonString)
        const buffer = new TextEncoder().encode(jsonString).buffer
        await cloudHandler.upload(SamplesCatalogPath, buffer)
        progress(1.0)
    }

    export const backupProjects = async (cloudHandler: CloudStorageHandler,
                                         log: Procedure<string>,
                                         progress: Progress.Handler) => {
        progress(0.0)
        const [listProgress, uploadProgress] = Progress.split(progress, 2)
        log("Start syncing projects...")
        await Wait.timeSpan(shortNotificationTime)
        const catalogFields = ["name", "modified", "created", "tags", "description"] as const
        const cloudProjects: Record<UUID.String, Pick<ProjectMeta, typeof catalogFields[number]>> =
            await cloudHandler.download(ProjectsCatalogPath)
                .then(json => JSON.parse(new TextDecoder().decode(json)), () => ({}))
        const listLocalResult = await Promises.tryCatch(ProjectStorage.listProjects({
            includeCover: true,
            progress: listProgress
        }))
        if (listLocalResult.status === "rejected") {
            progress(1.0)
            return log("Failed to list projects.")
        }
        listProgress(1.0)
        const unsyncedProjects = listLocalResult.value.filter(({uuid, meta: {modified}}) => {
            const cloudProject = cloudProjects[UUID.toString(uuid)]
            return isUndefined(cloudProject) || new Date(cloudProject.modified).getTime() < new Date(modified).getTime()
        })
        if (unsyncedProjects.length === 0) {
            log("No unsynced projects found.")
            await Wait.timeSpan(longNotificationTime)
            uploadProgress(1.0)
            return
        }
        log(`Upload ${unsyncedProjects.length} projects...`)
        await Wait.timeSpan(shortNotificationTime)
        const results = await Promises.allSettledWithLimit(unsyncedProjects
            .map(({uuid, meta, cover}: ProjectStorage.ListEntry, index, {length}) => async () => {
                uploadProgress((index + 1) / length)
                const folder = `${ProjectsPath}/${UUID.toString(uuid)}`
                const metaJson = new TextEncoder().encode(JSON.stringify(meta)).buffer
                const project = await ProjectStorage.loadProject(uuid)
                const tasks: Array<Promise<unknown>> = []
                tasks.push(cloudHandler.upload(`${folder}/project.od`, project))
                tasks.push(cloudHandler.upload(`${folder}/meta.json`, metaJson))
                if (isDefined(cover)) {
                    tasks.push(cloudHandler.upload(`${folder}/image.bin`, cover))
                }
                log(`Uploading project '${meta.name}'`)
                await Promises.timeout(Promise.all(tasks), TimeSpan.seconds(30), "Upload timeout (30s).")
                return {uuid, meta}
            }))
        const uploaded = results.filter(result => result.status === "fulfilled")
        uploaded.forEach(({value: {uuid, meta: {name, created, modified, tags, description}}}) =>
            cloudProjects[UUID.toString(uuid)] = {name, created, modified, tags, description})
        const jsonString = JSON.stringify(cloudProjects, null, 2)
        const buffer = new TextEncoder().encode(jsonString).buffer
        await cloudHandler.upload(ProjectsCatalogPath, buffer)
        uploadProgress(1.0)
        log(`${uploaded.length} successfully uploaded.`)
        await Wait.timeSpan(longNotificationTime)
    }
}