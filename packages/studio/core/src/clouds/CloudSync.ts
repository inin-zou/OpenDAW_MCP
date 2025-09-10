import {DefaultObservableValue, Progress, RuntimeNotifier, TimeSpan, unitValue} from "@opendaw/lib-std"
import {Wait} from "@opendaw/lib-runtime"
import {CloudStorageHandler} from "./CloudStorageHandler"
import {CloudSyncSamples} from "./CloudSyncSamples"
import {CloudSyncProjects} from "./CloudSyncProjects"

export namespace CloudSync {
    export const sync = async (cloudHandler: CloudStorageHandler,
                               cloudName: string,
                               audioContext: AudioContext) => {
        const progressValue = new DefaultObservableValue<unitValue>(0.0)
        const notification = RuntimeNotifier.progress({headline: `${cloudName} Sync`, progress: progressValue})
        const [progressSamples, progressProjects] = Progress.split(progress => progressValue.setValue(progress), 2)
        const log = (text: string) => notification.message = text
        try {
            await CloudSyncSamples.start(cloudHandler, audioContext, progressSamples, log)
            await CloudSyncProjects.start(cloudHandler, progressProjects, log)
            log("Everything is up to date.")
            await Wait.timeSpan(TimeSpan.seconds(2))
        } finally {
            notification.terminate()
            progressValue.terminate()
        }
    }
}