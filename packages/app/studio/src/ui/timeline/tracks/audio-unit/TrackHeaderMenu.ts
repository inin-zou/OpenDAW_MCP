import {MenuItem} from "@/ui/model/menu-item"
import {isInstanceOf, Option, Procedure, UUID} from "@opendaw/lib-std"
import {AudioUnitBoxAdapter, DeviceAccepts, IconSymbol, TrackBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {DebugMenus} from "@/ui/menu/debug"
import {MidiImport} from "@/ui/timeline/MidiImport.ts"
import {CaptureAudioBox, CaptureMidiBox, TrackBox} from "@opendaw/studio-boxes"
import {StudioService} from "@/service/StudioService"
import {AudioDevices, Capture, CaptureAudio, CaptureMidi, MidiDevices} from "@opendaw/studio-core"

export const installTrackHeaderMenu = (service: StudioService,
                                       audioUnitBoxAdapter: AudioUnitBoxAdapter,
                                       trackBoxAdapter: TrackBoxAdapter): Procedure<MenuItem> =>
    parent => {
        const inputAdapter = audioUnitBoxAdapter.input.getValue()
        if (inputAdapter.isEmpty()) {return parent}
        const accepts: DeviceAccepts = inputAdapter.unwrap("Cannot unwrap input adapter").accepts
        const acceptMidi = audioUnitBoxAdapter.captureBox.mapOr(box => isInstanceOf(box, CaptureMidiBox), false)
        const trackType = DeviceAccepts.toTrackType(accepts)
        const {project} = service
        const {captureManager, editing, selection} = project
        const captureOption = captureManager.get(audioUnitBoxAdapter.uuid)
        return parent.addMenuItem(
            MenuItem.default({label: "Enabled", checked: trackBoxAdapter.enabled.getValue()})
                .setTriggerProcedure(() => editing.modify(() => trackBoxAdapter.enabled.toggle())),
            MenuItem.default({
                label: `New ${TrackType.toLabelString(trackType)} Track`,
                hidden: trackBoxAdapter.type === TrackType.Undefined
            }).setTriggerProcedure(() => editing.modify(() => {
                TrackBox.create(project.boxGraph, UUID.generate(), box => {
                    box.type.setValue(trackType)
                    box.tracks.refer(audioUnitBoxAdapter.box.tracks)
                    box.index.setValue(audioUnitBoxAdapter.tracks.values().length)
                    box.target.refer(audioUnitBoxAdapter.box)
                })
            })),
            MenuItem.default({
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
                                parent.addMenuItem(...inputs.map(device => MenuItem.default({label: device.name ?? "Unknown"})
                                    .setTriggerProcedure(() => {
                                        editing.modify(() => capture.deviceId.setValue(Option.wrap(device.id)), false)
                                        capture.armed.setValue(true)
                                    })))
                            }
                        }
                    })
                }
            }),
            MenuItem.default({label: "Move", separatorBefore: true})
                .setRuntimeChildrenProcedure(parent => parent.addMenuItem(
                    MenuItem.default({label: "Track 1 Up", selectable: trackBoxAdapter.indexField.getValue() > 0})
                        .setTriggerProcedure(() => editing.modify(() => audioUnitBoxAdapter.moveTrack(trackBoxAdapter, -1))),
                    MenuItem.default({
                        label: "Track 1 Down",
                        selectable: trackBoxAdapter.indexField.getValue() < audioUnitBoxAdapter.tracks.collection.size() - 1
                    }).setTriggerProcedure(() => editing.modify(() => audioUnitBoxAdapter.moveTrack(trackBoxAdapter, 1))),
                    MenuItem.default({
                        label: "AudioUnit 1 Up",
                        selectable: audioUnitBoxAdapter.indexField.getValue() > 0 && false
                    }).setTriggerProcedure(() => editing.modify(() => audioUnitBoxAdapter.move(-1))),
                    MenuItem.default({
                        label: "AudioUnit 1 Down",
                        selectable: audioUnitBoxAdapter.indexField.getValue() < project.rootBoxAdapter.audioUnits.adapters()
                            .filter(adapter => !adapter.isOutput).length - 1 && false
                    }).setTriggerProcedure(() => editing.modify(() => audioUnitBoxAdapter.move(1)))
                )),
            MenuItem.default({label: "Select Clips", selectable: !trackBoxAdapter.clips.collection.isEmpty()})
                .setTriggerProcedure(() => trackBoxAdapter.clips.collection.adapters()
                    .forEach(clip => selection.select(clip.box))),
            MenuItem.default({label: "Select Regions", selectable: !trackBoxAdapter.regions.collection.isEmpty()})
                .setTriggerProcedure(() => trackBoxAdapter.regions.collection.asArray()
                    .forEach(region => selection.select(region.box))),
            MenuItem.default({
                label: "Import Midi...",
                hidden: !acceptMidi,
                separatorBefore: true
            }).setTriggerProcedure(() => MidiImport.toTracks(project, audioUnitBoxAdapter)),
            MenuItem.default({
                label: "Delete Track",
                selectable: !audioUnitBoxAdapter.isOutput,
                separatorBefore: true
            }).setTriggerProcedure(() => editing.modify(() => {
                if (audioUnitBoxAdapter.tracks.collection.size() === 1) {
                    project.api.deleteAudioUnit(audioUnitBoxAdapter.box)
                } else {
                    audioUnitBoxAdapter.deleteTrack(trackBoxAdapter)
                }
            })),
            MenuItem.default({
                label: `Delete '${audioUnitBoxAdapter.input.label.unwrapOrElse("No Input")}'`,
                selectable: !audioUnitBoxAdapter.isOutput
            }).setTriggerProcedure(() => editing.modify(() =>
                project.api.deleteAudioUnit(audioUnitBoxAdapter.box))),
            DebugMenus.debugBox(audioUnitBoxAdapter.box)
        )
    }