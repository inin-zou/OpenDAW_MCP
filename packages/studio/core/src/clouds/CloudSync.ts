import {DefaultObservableValue, Progress, RuntimeNotifier, TimeSpan, unitValue} from "@opendaw/lib-std"
import {Promises, Wait} from "@opendaw/lib-runtime"
import {CloudStorageHandler} from "./CloudStorageHandler"
import {CloudSyncSamples} from "./CloudSyncSamples"
import {CloudSyncProjects} from "./CloudSyncProjects"
import {CloudAuthManager} from "./CloudAuthManager"
import {Service} from "./Service"

// TODO Update views after syncing

export namespace CloudSync {
    export const sync = async (cloudAuthManager: CloudAuthManager, service: Service) => {
        const DialogMessage = `openDAW will never store or share your personal account details!
                                        
                                        Dropbox requires permission to read “basic account info” such as your name and email, but openDAW does not use or retain this information. We only access the files you choose to synchronize. 
                                        
                                        Clicking 'Ok' may open a new tab to authorize your dropbox.`

        const approved = await RuntimeNotifier.approve({
            headline: "openDAW and your data",
            message: DialogMessage,
            approveText: "Ok",
            cancelText: "Cancel"
        })
        if (!approved) {return}
        const handlerResult = await Promises.tryCatch(cloudAuthManager.getHandler(service))
        if (handlerResult.status === "rejected") {
            console.debug(`Promise rejected with '${(handlerResult.error)}'`)
            return
        }
        const {status, error} =
            await Promises.tryCatch(CloudSync.syncWithHandler(handlerResult.value, service))
        if (status === "rejected") {
            await RuntimeNotifier.info({
                headline: `Could not sync with ${service}`,
                message: String(error)
            })
        }
    }

    export const syncWithHandler = async (cloudHandler: CloudStorageHandler, cloudName: string) => {
        const progressValue = new DefaultObservableValue<unitValue>(0.0)
        const notification = RuntimeNotifier.progress({headline: `${cloudName} Sync`, progress: progressValue})
        const [progressSamples, progressProjects] = Progress.split(progress => progressValue.setValue(progress), 2)
        const log = (text: string) => notification.message = text
        try {
            await CloudSyncSamples.start(cloudHandler, progressSamples, log)
            await CloudSyncProjects.start(cloudHandler, progressProjects, log)
            log("Everything is up to date.")
            await Wait.timeSpan(TimeSpan.seconds(2))
        } finally {
            notification.terminate()
            progressValue.terminate()
        }
    }
}