import {MenuItem} from "@/ui/model/menu-item"
import {Arrays, int, isInstanceOf, Option} from "@opendaw/lib-std"
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
                        const currentDeviceId = capture.deviceId
                        const channelField = capture.captureBox.channel
                        const createItem = (deviceId: Option<string>,
                                            channel: Option<int>,
                                            label: string,
                                            checked: boolean) => MenuItem.default({label, checked})
                            .setTriggerProcedure(() => {
                                editing.modify(() => {
                                    currentDeviceId.setValue(deviceId)
                                    channelField.setValue(channel.unwrapOrElse(-1))
                                }, false)
                                capture.armed.setValue(true)
                            })
                        parent.addMenuItem(
                            MenuItem.default({
                                label: "All devices",
                                checked: currentDeviceId.getValue().isEmpty() && channelField.getValue() === -1
                            }).setRuntimeChildrenProcedure(parent => {
                                const hasNoDevice = currentDeviceId.getValue().isEmpty()
                                parent.addMenuItem(
                                    createItem(Option.None, Option.None, "All channels", channelField.getValue() === -1 && hasNoDevice),
                                    ...Arrays.create(channel =>
                                        createItem(Option.None, Option.wrap(channel),
                                            `Channel ${channel + 1}`,
                                            channelField.getValue() === channel && hasNoDevice), 16)
                                )
                            }),
                            ...inputs.map((device, index) => {
                                    const optDeviceId = Option.wrap(device.id)
                                    const sameDevice = currentDeviceId.getValue().equals(optDeviceId)
                                    return MenuItem.default({
                                        label: device.name ?? "Unknown", checked: sameDevice, separatorBefore: index === 0
                                    }).setRuntimeChildrenProcedure(parent => {
                                        parent.addMenuItem(
                                            createItem(optDeviceId, Option.None, "All channels", channelField.getValue() === -1 && sameDevice),
                                            ...Arrays.create(channel =>
                                                createItem(optDeviceId, Option.wrap(channel),
                                                    `Channel ${channel + 1}`,
                                                    channelField.getValue() === channel && sameDevice), 16)
                                        )
                                    })
                                }
                            )
                        )
                    }
                }
            })
        }
    })
}