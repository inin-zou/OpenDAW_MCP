import css from "./TrackHeader.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement, Group, Inject, replaceChildren} from "@opendaw/lib-jsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {MenuItem} from "@/ui/model/menu-item.ts"
import {AudioUnitBoxAdapter, IconSymbol, TrackBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {AudioUnitChannelControls} from "@/ui/timeline/tracks/audio-unit/AudioUnitChannelControls.tsx"
import {installTrackHeaderMenu} from "@/ui/timeline/tracks/audio-unit/TrackHeaderMenu.ts"
import {Events, Html, Keyboard} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {ColorCodes, Colors} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "TrackHeader")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    trackBoxAdapter: TrackBoxAdapter
    audioUnitBoxAdapter: AudioUnitBoxAdapter
}

export const TrackHeader = ({lifecycle, service, trackBoxAdapter, audioUnitBoxAdapter}: Construct) => {
    const nameLabel = Inject.value("Untitled")
    const channelControls: HTMLElement = <Group/>
    const {project} = service
    lifecycle.ownAll(
        audioUnitBoxAdapter.input.catchupAndSubscribeLabelChange(option => nameLabel.value = option.unwrapOrElse("No Input")),
        trackBoxAdapter.indexField.catchupAndSubscribe(owner => {
            Html.empty(channelControls)
            if (owner.getValue() === 0) {
                replaceChildren(channelControls, (
                    <AudioUnitChannelControls lifecycle={lifecycle}
                                              project={project}
                                              midiDevices={service.midiLearning}
                                              adapter={audioUnitBoxAdapter}/>
                ))
            } else {
                replaceChildren(channelControls, <div/>)
            }
        }),
        trackBoxAdapter.catchupAndSubscribePath(option =>
            nameLabel.value = option.unwrapOrElse(["", "Unassigned track"]).join(" "))
    )

    const color = ColorCodes.forAudioType(audioUnitBoxAdapter.type)
    const element: HTMLElement = (
        <div className={Html.buildClassList(className, "is-primary")} tabindex={-1}>
            <Icon symbol={TrackType.toIconSymbol(trackBoxAdapter.type)} style={{color}}/>
            <h5 style={{color: Colors.dark}}>{nameLabel}</h5>
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