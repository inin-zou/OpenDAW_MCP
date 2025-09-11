import {MenuItem} from "@/ui/model/menu-item"
import {StudioService} from "@/service/StudioService"
import {Dialogs} from "@/ui/components/dialogs.tsx"
import {RouteLocation} from "@opendaw/lib-jsx"
import {EmptyExec, isDefined, panic} from "@opendaw/lib-std"
import {Browser, ModfierKeys} from "@opendaw/lib-dom"
import {SyncLogService} from "@/service/SyncLogService"
import {IconSymbol} from "@opendaw/studio-adapters"
import {CloudSync} from "@opendaw/studio-core"

export const initAppMenu = (service: StudioService) => MenuItem.root()
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
                        }).setTriggerProcedure(() => service.importDawproject().then(EmptyExec, EmptyExec))
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
                MenuItem.default({
                    label: "Cloud Backup",
                    separatorBefore: true,
                    hidden: !Browser.isLocalHost() && location.hash !== "#cloud"
                }).setRuntimeChildrenProcedure(parent => {
                    parent.addMenuItem(
                        MenuItem.default({
                            label: "Dropbox",
                            icon: IconSymbol.Dropbox
                        }).setTriggerProcedure(() =>
                            CloudSync.sync(service.cloudAuthManager, "Dropbox").then(EmptyExec)),
                        MenuItem.default({
                            label: "GoogleDrive",
                            icon: IconSymbol.GoogleDrive
                        }).setTriggerProcedure(() =>
                            CloudSync.sync(service.cloudAuthManager, "GoogleDrive").then(EmptyExec))
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
                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/imprint")),
                MenuItem.default({label: "Privacy Policy"})
                    .setTriggerProcedure(() => RouteLocation.get().navigateTo("/privacy"))
            )
        }
    )