import {MenuItem} from "@/ui/model/menu-item"
import {StudioService} from "@/service/StudioService"
import {Dialogs} from "@/ui/components/dialogs.tsx"
import {RouteLocation} from "@opendaw/lib-jsx"
import {isDefined, panic, warn} from "@opendaw/lib-std"
import {Browser, ModfierKeys} from "@opendaw/lib-dom"
import {SyncLogService} from "@/service/SyncLogService"
import {IconSymbol} from "@opendaw/studio-adapters"
import {CloudAuthManager} from "@/clouds/CloudAuthManager"
import {Promises} from "@opendaw/lib-runtime"
import {CloudSync} from "@/clouds/CloudSync"

export const initAppMenu = (service: StudioService) => {
    return MenuItem.root()
        .setRuntimeChildrenProcedure(parent => {
                parent.addMenuItem(
                    MenuItem.header({label: "openDAW", icon: IconSymbol.OpenDAW}),
                    MenuItem.default({label: "New"})
                        .setTriggerProcedure(() => service.closeProject()),
                    MenuItem.default({label: "Open...", shortcut: [ModfierKeys.System.Cmd, "O"]})
                        .setTriggerProcedure(() => service.browse()),
                    MenuItem.default({
                        label: "Save",
                        shortcut: [ModfierKeys.System.Cmd, "S"],
                        selectable: service.hasProfile
                    }).setTriggerProcedure(() => service.save()),
                    MenuItem.default({
                        label: "Save As...",
                        shortcut: [ModfierKeys.System.Cmd, ModfierKeys.System.Shift, "S"],
                        selectable: service.hasProfile
                    }).setTriggerProcedure(() => service.saveAs()),
                    MenuItem.default({label: "Import"})
                        .setRuntimeChildrenProcedure(parent => parent.addMenuItem(
                            MenuItem.default({label: "Audio Files..."})
                                .setTriggerProcedure(() => service.browseForSamples(true)),
                            MenuItem.default({label: "Project Bundle..."})
                                .setTriggerProcedure(() => service.importZip()),
                            MenuItem.default({
                                label: "DAWproject..."
                            }).setTriggerProcedure(async () => {
                                if (Browser.isLocalHost()) {
                                    return service.importDawproject()
                                } else {
                                    const approved = await Dialogs.approve({
                                        headline: "DAWproject Early Preview",
                                        message: "Please be aware that the import may not work as expected.",
                                        approveText: "Import",
                                        cancelText: "Cancel"
                                    })
                                    if (approved) {
                                        return service.importDawproject()
                                    }
                                }
                            })
                        )),
                    MenuItem.default({label: "Export", selectable: service.hasProfile})
                        .setRuntimeChildrenProcedure(parent => parent.addMenuItem(
                            MenuItem.default({label: "Mixdown...", selectable: service.hasProfile})
                                .setTriggerProcedure(() => service.exportMixdown()),
                            MenuItem.default({label: "Stems...", selectable: service.hasProfile})
                                .setTriggerProcedure(() => service.exportStems()),
                            MenuItem.default({label: "Project Bundle...", selectable: service.hasProfile})
                                .setTriggerProcedure(() => service.exportZip()),
                            MenuItem.default({label: "DAWproject...", selectable: service.hasProfile})
                                .setTriggerProcedure(async () => service.exportDawproject())
                        )),
                    MenuItem.default({label: "Cloud Services"})
                        .setRuntimeChildrenProcedure(parent => {
                            parent.addMenuItem(
                                MenuItem.default({label: "Dropbox Sync", icon: IconSymbol.Dropbox})
                                    .setTriggerProcedure(async () => {
                                        const approveResult = await Promises.tryCatch(Dialogs.approve({
                                            headline: "openDAW and your data",
                                            message: "openDAW will never store or share your personal account details. " +
                                                "Dropbox requires permission to read “basic account info” such as your " +
                                                "name and email, but openDAW does not use or retain this information. " +
                                                "We only access the files you choose to synchronize.",
                                            approveText: "Connect",
                                            cancelText: "Cancel",
                                            reverse: true,
                                            maxWidth: "30em"
                                        }))
                                        if (approveResult.status === "rejected") {return}
                                        const manager = await CloudAuthManager.create()
                                        const dropboxResult = await Promises.tryCatch(manager.dropbox())
                                        if (dropboxResult.status === "rejected") {
                                            console.debug(`Promise rejected with '${(dropboxResult.error)}'`)
                                            return
                                        }
                                        const cloudHandler = dropboxResult.value
                                        const p = document.createElement("code")
                                        Object.assign(p.style, {
                                            padding: "1em 0",
                                            overflow: "hidden",
                                            whiteSpace: "nowrap",
                                            textOverflow: "ellipsis",
                                            minWidth: "30em",
                                            maxWidth: "30em"
                                        })
                                        const monolog = Dialogs.processMonolog("Cloud Sync", p)
                                        const syncResult =
                                            await Promises.tryCatch(CloudSync
                                                .run(cloudHandler, service.audioContext, text => p.textContent = text))
                                        if (syncResult.status === "rejected") {return warn(String(syncResult.error))}
                                        monolog.close()
                                    }),
                                MenuItem.default({label: "Dropbox IO Test", icon: IconSymbol.Dropbox, hidden: true})
                                    .setTriggerProcedure(async () => {
                                        console.debug("create CloudAuthManager and authenticate...")
                                        const manager = await CloudAuthManager.create()
                                        const {status, error, value: handler} = await Promises.tryCatch(manager.dropbox())
                                        if (status === "rejected") {
                                            console.debug(`Promise rejected with '${error}'`)
                                            return
                                        }
                                        const path = "some-folder/test.txt"
                                        console.debug("upload tiny file to Dropbox", path)
                                        const buffer = new TextEncoder().encode("Hello World").buffer
                                        const uploadResult = await Promises.tryCatch(handler.upload(path, buffer))
                                        if (uploadResult.status === "rejected") {
                                            console.error(uploadResult.error)
                                            return
                                        }
                                        console.debug("upload result", uploadResult.value)
                                        const listResult = await Promises.tryCatch(handler.list(""))
                                        if (listResult.status === "rejected") {
                                            console.error(listResult.error)
                                            return
                                        }
                                        console.debug("list result", listResult.value)
                                        const downloadResult = await Promises.tryCatch(handler.download(path))
                                        if (downloadResult.status === "rejected") {
                                            console.error(downloadResult.error)
                                            return
                                        }
                                        const text = new TextDecoder().decode(downloadResult.value)
                                        console.debug("download result", downloadResult.value, text)
                                    })
                            )
                        }),
                    MenuItem.default({label: "Debug", separatorBefore: true})
                        .setRuntimeChildrenProcedure(parent => {
                            return parent.addMenuItem(
                                MenuItem.header({label: "Debugging", icon: IconSymbol.System}),
                                MenuItem.default({
                                    label: "New SyncLog...",
                                    selectable: isDefined(window.showSaveFilePicker)
                                }).setTriggerProcedure(() => SyncLogService.start(service)),
                                MenuItem.default({
                                    label: "Open SyncLog...",
                                    selectable: isDefined(window.showOpenFilePicker)
                                }).setTriggerProcedure(() => SyncLogService.append(service)),
                                MenuItem.default({
                                    label: "Show Boxes...",
                                    selectable: service.hasProfile,
                                    separatorBefore: true
                                }).setTriggerProcedure(() => Dialogs.debugBoxes(service.project.boxGraph)),
                                MenuItem.default({label: "Validate Project...", selectable: service.hasProfile})
                                    .setTriggerProcedure(() => service.verifyProject()),
                                MenuItem.default({
                                    label: "Load file...",
                                    separatorBefore: true
                                }).setTriggerProcedure(() => service.loadFile()),
                                MenuItem.default({
                                    label: "Save file...",
                                    selectable: service.hasProfile
                                }).setTriggerProcedure(() => service.saveFile()),
                                MenuItem.header({label: "Pages", icon: IconSymbol.Box}),
                                MenuItem.default({label: "・ Icons"})
                                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/icons")),
                                MenuItem.default({label: "・ Components"})
                                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/components")),
                                MenuItem.default({label: "・ Automation"})
                                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/automation")),
                                MenuItem.default({label: "・ Errors"})
                                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/errors")),
                                MenuItem.default({label: "・ Graph"})
                                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/graph")),
                                MenuItem.default({
                                    label: "Throw an error in main-thread 💣",
                                    separatorBefore: true,
                                    hidden: !Browser.isLocalHost() && location.hash !== "#admin"
                                }).setTriggerProcedure(() => panic("An error has been emulated")),
                                MenuItem.default({
                                    label: "Throw an error in audio-worklet 💣",
                                    hidden: !Browser.isLocalHost()
                                }).setTriggerProcedure(() => service.panicEngine())
                            )
                        }),
                    MenuItem.default({label: "Imprint", separatorBefore: true})
                        .setTriggerProcedure(() => RouteLocation.get().navigateTo("/imprint"))
                )
            }
        )
}