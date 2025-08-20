import {
    AudioFileBox,
    NanoDeviceBox,
    PlayfieldDeviceBox,
    PlayfieldSampleBox,
    TapeDeviceBox,
    VaporisateurDeviceBox
} from "@opendaw/studio-boxes"
import {UUID} from "@opendaw/lib-std"
import {Waveform} from "@opendaw/lib-dsp"
import {BoxGraph, Field} from "@opendaw/lib-box"
import {IconSymbol, TrackType} from "@opendaw/studio-adapters"

import {InstrumentFactory} from "./InstrumentFactory"
import {Pointers} from "@opendaw/studio-enums"

export namespace InstrumentFactories {
    export const Tape: InstrumentFactory = {
        defaultName: "Tape",
        defaultIcon: IconSymbol.Tape,
        description: "Plays audio regions & clips",
        trackType: TrackType.Audio,
        create: (boxGraph: BoxGraph, host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>, name: string, icon: IconSymbol): TapeDeviceBox =>
            TapeDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.flutter.setValue(0.2)
                box.wow.setValue(0.05)
                box.noise.setValue(0.02)
                box.saturation.setValue(0.5)
                box.host.refer(host)
            })
    }

    export const Nano: InstrumentFactory = {
        defaultName: "Nano",
        defaultIcon: IconSymbol.NanoWave,
        description: "Simple sampler",
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph, host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>, name: string, icon: IconSymbol): NanoDeviceBox => {
            const fileUUID = UUID.parse("c1678daa-4a47-4cba-b88f-4f4e384663c3")
            const audioFileBox: AudioFileBox = boxGraph.findBox<AudioFileBox>(fileUUID)
                .unwrapOrElse(() => AudioFileBox.create(boxGraph, fileUUID, box => {
                    box.fileName.setValue("Rhode")
                }))
            return NanoDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.file.refer(audioFileBox)
                box.host.refer(host)
            })
        }
    }

    export const Playfield: InstrumentFactory = {
        defaultName: "Playfield",
        defaultIcon: IconSymbol.Playfield,
        description: "Drum computer",
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph, host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>, name: string, icon: IconSymbol): PlayfieldDeviceBox => {
            const deviceBox = PlayfieldDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.host.refer(host)
            })
            const files = [
                useFile(boxGraph, UUID.parse("8bb2c6e8-9a6d-4d32-b7ec-1263594ef367"), "909 Bassdrum"),
                useFile(boxGraph, UUID.parse("0017fa18-a5eb-4d9d-b6f2-e2ddd30a3010"), "909 Snare"),
                useFile(boxGraph, UUID.parse("28d14cb9-1dc6-4193-9dd7-4e881f25f520"), "909 Low Tom"),
                useFile(boxGraph, UUID.parse("21f92306-d6e7-446c-a34b-b79620acfefc"), "909 Mid Tom"),
                useFile(boxGraph, UUID.parse("ad503883-8a72-46ab-a05b-a84149953e17"), "909 High Tom"),
                useFile(boxGraph, UUID.parse("cfee850b-7658-4d08-9e3b-79d196188504"), "909 Rimshot"),
                useFile(boxGraph, UUID.parse("32a6f36f-06eb-4b84-bb57-5f51103eb9e6"), "909 Clap"),
                useFile(boxGraph, UUID.parse("e0ac4b39-23fb-4a56-841d-c9e0ff440cab"), "909 Closed Hat"),
                useFile(boxGraph, UUID.parse("51c5eea4-391c-4743-896a-859692ec1105"), "909 Open Hat"),
                useFile(boxGraph, UUID.parse("42a56ff6-89b6-4f2e-8a66-5a41d316f4cb"), "909 Crash"),
                useFile(boxGraph, UUID.parse("87cde966-b799-4efc-a994-069e703478d3"), "909 Ride")
            ]
            const samples = files.map((file, index) => PlayfieldSampleBox.create(boxGraph, UUID.generate(), box => {
                box.device.refer(deviceBox.samples)
                box.file.refer(file)
                box.index.setValue(60 + index)
            }))
            samples[7].exclude.setValue(true)
            samples[8].exclude.setValue(true)
            return deviceBox
        }
    }

    export const Vaporisateur: InstrumentFactory = {
        defaultName: "Vaporisateur",
        defaultIcon: IconSymbol.Piano,
        description: "Classic subtractive synthesizer",
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph, host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>, name: string, icon: IconSymbol): VaporisateurDeviceBox =>
            VaporisateurDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.tune.setInitValue(0.0)
                box.cutoff.setInitValue(1000.0)
                box.resonance.setInitValue(0.1)
                box.attack.setInitValue(0.005)
                box.release.setInitValue(0.1)
                box.waveform.setInitValue(Waveform.sine)
                box.host.refer(host)
            })
    }

    export const Named = {Vaporisateur, Playfield, Nano, Tape}
    export type Keys = keyof typeof Named

    const useFile = (boxGraph: BoxGraph, fileUUID: UUID.Format, name: string) => boxGraph.findBox<AudioFileBox>(fileUUID)
        .unwrapOrElse(() => AudioFileBox.create(boxGraph, fileUUID, box => {
            box.fileName.setValue(name)
        }))
}