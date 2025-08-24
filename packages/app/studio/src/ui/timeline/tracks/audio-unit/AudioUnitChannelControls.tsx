import css from "./AudioUnitChannelControls.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {RelativeUnitValueDragging} from "@/ui/wrapper/RelativeUnitValueDragging.tsx"
import {SnapCenter, SnapCommonDecibel} from "@/ui/configs.ts"
import {Knob} from "@/ui/components/Knob.tsx"
import {Checkbox} from "@/ui/components/Checkbox.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {createElement} from "@opendaw/lib-jsx"
import {EditWrapper} from "@/ui/wrapper/EditWrapper.ts"
import {AudioUnitBoxAdapter, IconSymbol} from "@opendaw/studio-adapters"
import {attachParameterContextMenu} from "@/ui/menu/automation.ts"
import {ControlIndicator} from "@/ui/components/ControlIndicator"
import {Html} from "@opendaw/lib-dom"
import {MIDILearning} from "@/midi/devices/MIDILearning"
import {Colors, Project} from "@opendaw/studio-core"
import {PeakVolumeSlider} from "@/ui/components/PeakVolumeSlider"
import {gainToDb} from "@opendaw/lib-dsp"

const className = Html.adoptStyleSheet(css, "AudioUnitChannelControls")

type Construct = {
    lifecycle: Lifecycle
    project: Project
    midiDevices: MIDILearning
    adapter: AudioUnitBoxAdapter
}

export const AudioUnitChannelControls = ({lifecycle, project, midiDevices, adapter}: Construct) => {
    const {volume, panning, mute, solo} = adapter.namedParameter
    const {editing} = project
    const volumeControl = (
        <RelativeUnitValueDragging lifecycle={lifecycle}
                                   editing={project.editing}
                                   parameter={volume}
                                   options={SnapCommonDecibel}>
            <ControlIndicator lifecycle={lifecycle} parameter={volume}>
                <Knob lifecycle={lifecycle} value={volume} anchor={0.0} color={Colors.yellow}/>
            </ControlIndicator>
        </RelativeUnitValueDragging>
    )
    const panningControl = (
        <RelativeUnitValueDragging lifecycle={lifecycle}
                                   editing={editing}
                                   parameter={panning}
                                   options={SnapCenter}>
            <ControlIndicator lifecycle={lifecycle} parameter={panning}>
                <Knob lifecycle={lifecycle} value={panning} anchor={0.5} color={Colors.green}/>
            </ControlIndicator>
        </RelativeUnitValueDragging>
    )
    const muteControl = (
        <ControlIndicator lifecycle={lifecycle} parameter={mute}>
            <Checkbox lifecycle={lifecycle}
                      model={EditWrapper.forAutomatableParameter(editing, mute)}
                      appearance={{activeColor: Colors.red, framed: true}}>
                <Icon symbol={IconSymbol.Mute}/>
            </Checkbox>
        </ControlIndicator>
    )
    const soloControl = (
        <ControlIndicator lifecycle={lifecycle} parameter={solo}>
            <Checkbox lifecycle={lifecycle}
                      model={EditWrapper.forAutomatableParameter(editing, solo)}
                      appearance={{activeColor: Colors.yellow, framed: true}}>
                <Icon symbol={IconSymbol.Solo}/>
            </Checkbox>
        </ControlIndicator>
    )
    const peaksInDb = new Float32Array(2)
    lifecycle.ownAll(
        attachParameterContextMenu(editing, midiDevices, adapter.tracks, volume, volumeControl),
        attachParameterContextMenu(editing, midiDevices, adapter.tracks, panning, panningControl),
        attachParameterContextMenu(editing, midiDevices, adapter.tracks, mute, muteControl),
        attachParameterContextMenu(editing, midiDevices, adapter.tracks, solo, soloControl),
        project.liveStreamReceiver.subscribeFloats(adapter.address, values => {
            peaksInDb[0] = gainToDb(values[0])
            peaksInDb[1] = gainToDb(values[1])
        })
    )
    return (
        <div className={className}>
            <header>
                <div className="channel-mix">
                    {panningControl}
                </div>
                <div className="channel-isolation">
                    {muteControl}
                    {soloControl}
                </div>
                <div className="channel-capture">
                    {adapter.captureBox.ifSome(box => (
                        <Checkbox lifecycle={lifecycle}
                                  model={EditWrapper.forValue(editing, box.armed)}
                                  appearance={{activeColor: Colors.red, framed: true}}>
                            <Icon symbol={IconSymbol.Record}/>
                        </Checkbox>
                    ))}
                </div>
            </header>
            <PeakVolumeSlider lifecycle={lifecycle} peaks={peaksInDb}/>
        </div>
    )
}