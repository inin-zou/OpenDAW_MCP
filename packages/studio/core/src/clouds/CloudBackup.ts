import {DefaultObservableValue, Progress, RuntimeNotifier, unitValue} from "@opendaw/lib-std"
import {CloudHandler} from "./CloudHandler"
import {CloudBackupSamples} from "./CloudBackupSamples"
import {CloudBackupProjects} from "./CloudBackupProjects"
import {CloudAuthManager} from "./CloudAuthManager"
import {CloudService} from "./CloudService"

// TODO Update views after syncing

export namespace CloudBackup {
    export const backup = async (cloudAuthManager: CloudAuthManager, service: CloudService) => {
        const DialogMessage = `openDAW will never store or share your personal account details!
                                        
                                        Dropbox requires permission to read “basic account info” such as your name and email, but openDAW does not use or retain this information. We only access the files you choose to synchronize. 
                                        
                                        Clicking 'Sync' may open a new tab to authorize your dropbox.`

        const approved = await RuntimeNotifier.approve({
            headline: "openDAW and your data",
            message: DialogMessage,
            approveText: "Sync",
            cancelText: "Cancel"
        })
        if (!approved) {return}
        try {
            const handler = await cloudAuthManager.getHandler(service)
            await CloudBackup.backupWithHandler(handler, service)
            await RuntimeNotifier.info({
                headline: "Cloud Backup",
                message: "Everything is up to date."
            })
        } catch (reason: unknown) {
            await RuntimeNotifier.info({
                headline: `Could not sync with ${service}`,
                message: String(reason)
            })
        }
    }

    export const backupWithHandler = async (cloudHandler: CloudHandler, service: CloudService) => {
        const progressValue = new DefaultObservableValue<unitValue>(0.0)
        const notification = RuntimeNotifier.progress({headline: `Backup with ${service}`, progress: progressValue})
        const log = (text: string) => notification.message = text
        const [progressSamples, progressProjects] = Progress.split(progress => progressValue.setValue(progress), 2)
        try {
            // await CloudBackupSamples.start(cloudHandler, progressSamples, log)
            await CloudBackupProjects.start(cloudHandler, progressProjects, log)
        } finally {
            progressValue.terminate()
            notification.terminate()
        }
    }
}