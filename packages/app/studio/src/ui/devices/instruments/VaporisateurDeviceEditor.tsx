import css from "./VaporisateurDeviceEditor.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {DeviceHost, VaporisateurDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {ControlBuilder} from "@/ui/devices/ControlBuilder.tsx"
import {DevicePeakMeter} from "@/ui/devices/panel/DevicePeakMeter.tsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {InstrumentFactories} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "editor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: VaporisateurDeviceBoxAdapter
    deviceHost: DeviceHost
}

export const VaporisateurDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const {volume, octave, tune, waveform, cutoff, resonance, attack, release, filterEnvelope} = adapter.namedParameter
    const {project} = service
    const {editing, midiLearning, liveStreamReceiver} = project
    return (
        <DeviceEditor lifecycle={lifecycle}
                      project={project}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forAudioUnitInput(parent, service, deviceHost)}
                      populateControls={() => (
                          <div className={className}>
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: volume
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: octave
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: tune
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: waveform
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: cutoff
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: resonance
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: attack
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: release
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: filterEnvelope
                              })}
                          </div>
                      )}
                      populateMeter={() => (
                          <DevicePeakMeter lifecycle={lifecycle}
                                           receiver={liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={InstrumentFactories.Vaporisateur.defaultIcon}/>
    )
}