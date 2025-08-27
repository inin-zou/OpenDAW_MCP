import {
    asDefined,
    assert,
    byte,
    Func,
    isDefined,
    isUndefined,
    Notifier,
    Option,
    Subscription,
    Terminable,
    warn
} from "@opendaw/lib-std"
import {Events} from "@opendaw/lib-dom"
import {MidiData} from "@opendaw/lib-midi"
import {AudioUnitBox, CaptureMidiBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {RecordMidi} from "./RecordMidi"
import {RecordingContext} from "./RecordingContext"
import {CaptureManager} from "./CaptureManager"
import {MidiDevices} from "../MidiDevices"
import {Promises} from "@opendaw/lib-runtime"

export class CaptureMidi extends Capture<CaptureMidiBox> {
    readonly #streamGenerator: Func<void, Promise<void>>
    readonly #notifier = new Notifier<MIDIMessageEvent>()

    #filterChannel: Option<byte> = Option.None

    #streaming: Option<Subscription> = Option.None

    constructor(manager: CaptureManager, audioUnitBox: AudioUnitBox, captureMidiBox: CaptureMidiBox) {
        super(manager, audioUnitBox, captureMidiBox)

        this.#streamGenerator = Promises.sequential(() => this.#updateStream())

        this.ownAll(
            captureMidiBox.channel.subscribe(async owner => {
                const channel = owner.getValue()
                this.#filterChannel = channel >= 0 ? Option.wrap(channel) : Option.None
                await this.#streamGenerator()
            }),
            captureMidiBox.deviceId.catchupAndSubscribe(async () => {
                if (this.armed.getValue()) {
                    await this.#streamGenerator()
                }
            }),
            this.armed.catchupAndSubscribe(async owner => {
                const armed = owner.getValue()
                if (armed) {
                    await this.#streamGenerator()
                } else {
                    this.#stopStream()
                }
            }),
            this.#notifier.subscribe(event => {
                console.debug(MidiData.debug(event.data))
                const data = asDefined(event.data)
                const engine = manager.project.engine
                const isNoteOn = MidiData.isNoteOn(data)
                if (MidiData.isNoteOff(data) || (isNoteOn && MidiData.readVelocity(data) === 0)) {
                    engine.noteOff(this.uuid, MidiData.readPitch(data))
                } else if (isNoteOn) {
                    engine.noteOn(this.uuid, MidiData.readPitch(data), MidiData.readVelocity(data))
                }
            })
        )
    }

    get label(): string {
        return MidiDevices.get().mapOr(midiAccess => this.deviceId.getValue().match({
            none: () => this.armed.getValue() ? "Listening to all MIDI devices" : "Arm to listen to MIDI device...",
            some: value => `Listening to ${midiAccess.inputs.get(value)?.name}`
        }), "MIDI not available")
    }

    get deviceLabel(): Option<string> {
        return this.deviceId.getValue()
            .flatMap(deviceId => MidiDevices.inputs()
                .map(inputs => inputs.find(input => input.id === deviceId)?.name))
    }

    async prepareRecording({}: RecordingContext): Promise<void> {
        const availableMidiDevices = MidiDevices.get()
        if (availableMidiDevices.isEmpty()) {
            return Promise.reject("MIDI is not available")
        }
        const option = this.deviceId.getValue()
        if (option.nonEmpty()) {
            const {inputs} = availableMidiDevices.unwrap()
            const captureDevices = Array.from(inputs.values())
            const deviceId = option.unwrap()
            if (isUndefined(captureDevices.find(device => deviceId === device.id))) {
                return warn(`Could not find MIDI device with id: '${deviceId}'`)
            }
        }
    }

    startRecording({project}: RecordingContext): Terminable {
        const availableMidiDevices = MidiDevices.inputs()
        assert(availableMidiDevices.nonEmpty(), "No MIDI input devices found")
        return RecordMidi.start({notifier: this.#notifier, project, capture: this})
    }

    async #updateStream() {
        // TODO Check if the requirements have been changed (are different than the current stream setup)
        if (MidiDevices.get().isEmpty()) {await MidiDevices.requestPermission()}
        const availableMidiDevices = MidiDevices.inputs()
        const inputs = availableMidiDevices.unwrap()
        const captureDevices = this.deviceId.getValue().match({
            none: () => inputs,
            some: id => inputs.filter(device => id === device.id)
        })
        const activeNotes = new Int8Array(128)
        this.#streaming.ifSome(terminable => terminable.terminate())
        this.#streaming = Option.wrap(Terminable.many(
            ...captureDevices.map(input => Events.subscribe(input, "midimessage",
                (event: MIDIMessageEvent) => {
                    const data = event.data
                    if (isDefined(data) &&
                        this.#filterChannel.mapOr(channel => MidiData.readChannel(data) === channel, true)) {
                        if (MidiData.isNoteOn(data)) {
                            activeNotes[MidiData.readPitch(data)]++
                            this.#notifier.notify(event)
                        } else if (MidiData.isNoteOff(data)) {
                            activeNotes[MidiData.readPitch(data)]--
                            this.#notifier.notify(event)
                        }
                    }
                })), Terminable.create(() => activeNotes.forEach((count, index) => {
                if (count > 0) {
                    // TODO respect channel!
                    const event = new MessageEvent("midimessage", {data: MidiData.noteOff(index, count)})
                    for (let i = 0; i < count; i++) {
                        this.#notifier.notify(event)
                    }
                }
            }))))
    }

    #stopStream(): void {
        this.#streaming.ifSome(terminable => terminable.terminate())
        this.#streaming = Option.None
    }
}