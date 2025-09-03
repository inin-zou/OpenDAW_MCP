import css from "./TrackHeader.sass?inline"
import {Lifecycle, panic, Terminator} from "@opendaw/lib-std"
import {createElement, Group, replaceChildren} from "@opendaw/lib-jsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {MenuItem} from "@/ui/model/menu-item.ts"
import {AudioUnitBoxAdapter, IconSymbol, TrackBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {AudioUnitChannelControls} from "@/ui/timeline/tracks/audio-unit/AudioUnitChannelControls.tsx"
import {installTrackHeaderMenu} from "@/ui/timeline/tracks/audio-unit/TrackHeaderMenu.ts"
import {Errors, Events, Html, Keyboard} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {ColorCodes, Colors} from "@opendaw/studio-core"
import {Surface} from "@/ui/surface/Surface"
import {Promises} from "@opendaw/lib-runtime"

const className = Html.adoptStyleSheet(css, "TrackHeader")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    trackBoxAdapter: TrackBoxAdapter
    audioUnitBoxAdapter: AudioUnitBoxAdapter
}

export const TrackHeader = ({lifecycle, service, trackBoxAdapter, audioUnitBoxAdapter}: Construct) => {
    const nameLabel: HTMLElement = <h5 style={{color: Colors.dark}}/>
    const channelControls: HTMLElement = <Group/>
    const {project} = service
    const channelLifeCycle = lifecycle.own(new Terminator())
    lifecycle.ownAll(
        audioUnitBoxAdapter.input
            .catchupAndSubscribeLabelChange(option => nameLabel.textContent = option.unwrapOrElse("No Input")),
        trackBoxAdapter.indexField
            .catchupAndSubscribe(owner => {
                channelLifeCycle.terminate()
                Html.empty(channelControls)
                if (owner.getValue() === 0) {
                    replaceChildren(channelControls, (
                        <AudioUnitChannelControls lifecycle={channelLifeCycle}
                                                  service={service}
                                                  adapter={audioUnitBoxAdapter}/>
                    ))
                } else {
                    replaceChildren(channelControls, <div/>)
                }
            }),
        trackBoxAdapter.catchupAndSubscribePath(option =>
            nameLabel.textContent = option.unwrapOrElse(["", "Unassigned track"]).join(" "))
    )

    const color = ColorCodes.forAudioType(audioUnitBoxAdapter.type)
    const element: HTMLElement = (
        <div className={Html.buildClassList(className, "is-primary")} tabindex={-1}>
            <Icon symbol={TrackType.toIconSymbol(trackBoxAdapter.type)} style={{color}}/>
            {nameLabel}
            {channelControls}
            <MenuButton root={MenuItem.root()
                .setRuntimeChildrenProcedure(installTrackHeaderMenu(service, audioUnitBoxAdapter, trackBoxAdapter))}
                        style={{minWidth: "0", justifySelf: "end"}}
                        appearance={{color: Colors.shadow, activeColor: Colors.cream}}>
                <Icon symbol={IconSymbol.Menu} style={{fontSize: "0.75em"}}/>
            </MenuButton>
        </div>
    )
    const audioUnitEditing = project.userEditingManager.audioUnit
    lifecycle.ownAll(
        Events.subscribeDblDwn(nameLabel, async event => {
            const {status, error, value} = await Promises.tryCatch(Surface.get(nameLabel)
                .requestFloatingTextInput(event, trackBoxAdapter.targetDeviceName.unwrapOrElse("")))
            if (status === "rejected") {
                if (!Errors.isAbort(error)) {return panic(error)}
            } else {
                project.editing.modify(() => trackBoxAdapter.targetDeviceName = value)
            }
        }),
        Events.subscribe(element, "pointerdown", () => {
            if (!audioUnitEditing.isEditing(audioUnitBoxAdapter.box.editing)) {
                audioUnitEditing.edit(audioUnitBoxAdapter.box.editing)
            }
        }),
        Events.subscribe(element, "keydown", (event) => {
            if (!Keyboard.GlobalShortcut.isDelete(event)) {return}
            project.editing.modify(() => {
                if (audioUnitBoxAdapter.tracks.collection.size() === 1) {
                    project.api.deleteAudioUnit(audioUnitBoxAdapter.box)
                } else {
                    audioUnitBoxAdapter.deleteTrack(trackBoxAdapter)
                }
            })
        })
    )
    return element
}