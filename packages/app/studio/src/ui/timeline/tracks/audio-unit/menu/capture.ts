import {MenuItem} from "@/ui/model/menu-item"
import {isInstanceOf, Option} from "@opendaw/lib-std"
import {CaptureAudioBox} from "@opendaw/studio-boxes"
import {AudioDevices, Capture, CaptureAudio, CaptureMidi, MidiDevices} from "@opendaw/studio-core"
import {AudioUnitBoxAdapter, IconSymbol, TrackBoxAdapter} from "@opendaw/studio-adapters"
import {Editing} from "@opendaw/lib-box"

export namespace MenuCapture {
    export const createItem = (audioUnitBoxAdapter: AudioUnitBoxAdapter,
                               trackBoxAdapter: TrackBoxAdapter,
                               editing: Editing,
                               captureOption: Option<Capture>) => MenuItem.default({
        label: audioUnitBoxAdapter.captureBox
            .mapOr(box => isInstanceOf(box, CaptureAudioBox) ? "Capture Audio" : "Capture MIDI", ""),
        hidden: trackBoxAdapter.indexField.getValue() !== 0 || captureOption.isEmpty(),
        separatorBefore: true
    }).setRuntimeChildrenProcedure(parent => {
        if (captureOption.isEmpty()) {return}
        const capture: Capture = captureOption.unwrap()
        if (isInstanceOf(capture, CaptureAudio)) {
            parent.addMenuItem(MenuItem.header({
                label: "Audio Inputs",
                icon: IconSymbol.AudioDevice
            }))
            const devices = AudioDevices.inputs
            if (devices.length === 0) {
                parent.addMenuItem(
                    MenuItem.default({label: "Click to access devices..."})
                        .setTriggerProcedure(() => AudioDevices.requestPermission()))
            } else {
                // TODO check and add item for "listening to all devices"
                parent.addMenuItem(...devices
                    .map(device => MenuItem.default({
                        label: device.label,
                        checked: capture.streamDeviceId.contains(device.deviceId)
                    }).setTriggerProcedure(() => {
                        editing.modify(() =>
                            capture.deviceId.setValue(Option.wrap(device.deviceId)), false)
                        capture.armed.setValue(true)
                    })))
            }
        } else if (isInstanceOf(capture, CaptureMidi)) {
            parent.addMenuItem(MenuItem.header({label: "Devices", icon: IconSymbol.Midi}))
            MidiDevices.inputs().match({
                none: () => {
                    parent.addMenuItem(
                        MenuItem.default({label: "Click to access devices..."})
                            .setTriggerProcedure(() => MidiDevices.requestPermission()))
                },
                some: inputs => {
                    if (inputs.length === 0) {
                        parent.addMenuItem(MenuItem.default({label: "No devices found", selectable: false}))
                    } else {
                        parent.addMenuItem(...inputs.map(device => MenuItem.default({label: device.name ?? "Unknown"})
                            .setTriggerProcedure(() => {
                                editing.modify(() => capture.deviceId.setValue(Option.wrap(device.id)), false)
                                capture.armed.setValue(true)
                            })))
                    }
                }
            })
        }
    })
}