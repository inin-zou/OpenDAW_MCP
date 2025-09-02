import {MenuItem} from "@/ui/model/menu-item"
import {StudioService} from "@/service/StudioService"
import {Dialogs} from "@/ui/components/dialogs.tsx"
import {RouteLocation} from "@opendaw/lib-jsx"
import {isDefined, panic} from "@opendaw/lib-std"
import {Browser, ModfierKeys} from "@opendaw/lib-dom"
import {SyncLogService} from "@/service/SyncLogService"
import {IconSymbol} from "@opendaw/studio-adapters"
import {CloudAuthManager} from "@/clouds/CloudAuthManager"
import {Promises} from "@opendaw/lib-runtime"

export const initAppMenu = (service: StudioService) => {
    return MenuItem.root()
        .setRuntimeChildrenProcedure(parent => {
                parent.addMenuItem(
                    MenuItem.header({label: "openDAW", icon: IconSymbol.OpenDAW}),
                    MenuItem.default({label: "New"})
                        .setTriggerProcedure(() => service.closeProject()),
                    MenuItem.default({label: "Log into Dropbox"})
                        .setTriggerProcedure(async () => {
                            console.debug("create CloudAuthManager and authenticate...")
                            const manager = await CloudAuthManager.create()
                            const {status, error, value: handler} = await Promises.tryCatch(manager.dropbox())
                            if (status === "rejected") {
                                console.debug(`Promise rejected with '${error}'`)
                                return
                            }
                            const path = "test.txt"
                            console.debug("upload tiny file to Dropbox", path)
                            const uploadResult = await Promises.tryCatch(handler.upload(path, new TextEncoder().encode("Hello World").buffer))
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
                            console.debug("download result", downloadResult.value, new TextDecoder().decode(downloadResult.value))
                        }),
                    MenuItem.default({label: "Open...", shortcut: [ModfierKeys.System.Cmd, "O"]})
                        .setTriggerProcedure(() => service.browse()),
                    MenuItem.default({
                        label: "Save",
                        shortcut: [ModfierKeys.System.Cmd, "S"],
                        selectable: service.hasProjectSession
                    }).setTriggerProcedure(() => service.save()),
                    MenuItem.default({
                        label: "Save As...",
                        shortcut: [ModfierKeys.System.Cmd, ModfierKeys.System.Shift, "S"],
                        selectable: service.hasProjectSession
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
                                    return Dialogs.approve({
                                        headline: "DAWproject Early Preview",
                                        message: "Please be aware that the import may not work as expected.",
                                        approveText: "Import",
                                        cancelText: "Cancel"
                                    }).then(() => service.importDawproject())
                                }
                            })
                        )),
                    MenuItem.default({label: "Export", selectable: service.hasProjectSession})
                        .setRuntimeChildrenProcedure(parent => parent.addMenuItem(
                            MenuItem.default({label: "Mixdown...", selectable: service.hasProjectSession})
                                .setTriggerProcedure(() => service.exportMixdown()),
                            MenuItem.default({label: "Stems...", selectable: service.hasProjectSession})
                                .setTriggerProcedure(() => service.exportStems()),
                            MenuItem.default({label: "Project Bundle...", selectable: service.hasProjectSession})
                                .setTriggerProcedure(() => service.exportZip()),
                            MenuItem.default({label: "DAWproject...", selectable: service.hasProjectSession})
                                .setTriggerProcedure(async () => service.exportDawproject())
                        )),
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
                                    selectable: service.hasProjectSession,
                                    separatorBefore: true
                                }).setTriggerProcedure(() => Dialogs.debugBoxes(service.project.boxGraph)),
                                MenuItem.default({label: "Validate Project...", selectable: service.hasProjectSession})
                                    .setTriggerProcedure(() => service.verifyProject()),
                                MenuItem.default({
                                    label: "Load file...",
                                    separatorBefore: true
                                }).setTriggerProcedure(() => service.loadFile()),
                                MenuItem.default({
                                    label: "Save file...",
                                    selectable: service.hasProjectSession
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