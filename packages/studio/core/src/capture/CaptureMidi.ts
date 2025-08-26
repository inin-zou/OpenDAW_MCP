import {assert, byte, isDefined, isUndefined, Notifier, Option, Terminable, warn} from "@opendaw/lib-std"
import {Events} from "@opendaw/lib-dom"
import {MidiData} from "@opendaw/lib-midi"
import {AudioUnitBox, CaptureMidiBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {RecordMidi} from "./RecordMidi"
import {RecordingContext} from "./RecordingContext"
import {CaptureManager} from "./CaptureManager"

export class CaptureMidi extends Capture<CaptureMidiBox> {
    #midiAccess: Option<MIDIAccess> = Option.None

    #filterChannel: Option<byte> = Option.None

    constructor(manager: CaptureManager, audioUnitBox: AudioUnitBox, captureMidiBox: CaptureMidiBox) {
        super(manager, audioUnitBox, captureMidiBox)

        this.ownAll(
            captureMidiBox.channel.catchupAndSubscribe(owner => {
                const channel = owner.getValue()
                this.#filterChannel = channel >= 0 ? Option.wrap(channel) : Option.None
            })
        )
    }

    get deviceLabel(): Option<string> {return Option.wrap("MIDI coming soon.")}

    async prepareRecording({requestMIDIAccess}: RecordingContext): Promise<void> {
        return requestMIDIAccess()
            .then(midiAccess => {
                const option = this.deviceId.getValue()
                if (option.nonEmpty()) {
                    const captureDevices = Array.from(midiAccess.inputs.values())
                    const id = option.unwrap()
                    if (isUndefined(captureDevices.find(device => id === device.id))) {
                        return warn(`Could not find MIDI device with id: '${id}'`)
                    }
                }
                this.#midiAccess = Option.wrap(midiAccess)
            })
    }

    startRecording({project, engine}: RecordingContext): Terminable {
        assert(this.#midiAccess.nonEmpty(), "Stream not prepared.")
        const midiAccess = this.#midiAccess.unwrap()
        const notifier = new Notifier<MIDIMessageEvent>()
        const captureDevices = Array.from(midiAccess.inputs.values())
        this.deviceId.getValue().ifSome(id => captureDevices.filter(device => id === device.id))
        return Terminable.many(
            Terminable.many(
                ...captureDevices.map(input => Events.subscribe(input, "midimessage",
                    (event: MIDIMessageEvent) => {
                        const data = event.data
                        if (isDefined(data) &&
                            this.#filterChannel.mapOr(channel => MidiData.readChannel(data) === channel, true)) {
                            notifier.notify(event)
                        }
                    }))),
            RecordMidi.start({
                notifier,
                engine,
                project,
                capture: this
            })
        )
    }

    async #startCapturing() {
        // TODO
    }
}