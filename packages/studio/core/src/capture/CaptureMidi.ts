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
import {Promises} from "@opendaw/lib-runtime"
import {AudioUnitBox, CaptureMidiBox} from "@opendaw/studio-boxes"
import {MidiDevices} from "../MidiDevices"
import {Capture} from "./Capture"
import {CaptureDevices} from "./CaptureDevices"
import {RecordMidi} from "./RecordMidi"
import {RecordingContext} from "./RecordingContext"

export class CaptureMidi extends Capture<CaptureMidiBox> {
    readonly #streamGenerator: Func<void, Promise<void>>
    readonly #notifier = new Notifier<MIDIMessageEvent>()

    #filterChannel: Option<byte> = Option.None
    #streaming: Option<Subscription> = Option.None

    constructor(manager: CaptureDevices, audioUnitBox: AudioUnitBox, captureMidiBox: CaptureMidiBox) {
        super(manager, audioUnitBox, captureMidiBox)

        this.#streamGenerator = Promises.sequential(() => this.#updateStream())

        this.ownAll(
            captureMidiBox.channel.catchupAndSubscribe(async owner => {
                const channel = owner.getValue()
                this.#filterChannel = channel >= 0 ? Option.wrap(channel) : Option.None
                if (this.armed.getValue()) {
                    await this.#streamGenerator()
                }
            }),
            captureMidiBox.deviceId.subscribe(async () => {
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
                const data = asDefined(event.data)
                const engine = manager.project.engine
                if (MidiData.isNoteOn(data)) {
                    engine.noteOn(this.uuid, MidiData.readPitch(data), MidiData.readVelocity(data))
                } else if (MidiData.isNoteOff(data)) {
                    engine.noteOff(this.uuid, MidiData.readPitch(data))
                }
            })
        )
    }

    get label(): string {
        return MidiDevices.get().mapOr(midiAccess => this.deviceId.getValue().match({
            none: () => this.armed.getValue() ? this.#filterChannel.match({
                none: () => `Listening to all devices`,
                some: channel => `Listening to all devices on channel '${channel}'`
            }) : "Arm to listen to MIDI device...",
            some: value => {
                const device = midiAccess.inputs.get(value)
                if (isUndefined(device)) {return "⚠️ Could not find device"}
                const deviceName = device.name ?? "Unknown device"
                return this.#filterChannel.match({
                    none: () => `Listening to ${deviceName}`,
                    some: channel => `Listening to ${deviceName} on channel '${channel}'`
                })
            }
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
        if (MidiDevices.get().isEmpty()) {await MidiDevices.requestPermission()}
        const availableMidiDevices = MidiDevices.inputs()
        const available = availableMidiDevices.unwrap()
        const capturing = this.deviceId.getValue().match({
            none: () => available,
            some: id => available.filter(device => id === device.id)
        })
        const activeNotes = new Int8Array(128)
        this.#streaming.ifSome(terminable => terminable.terminate())
        this.#streaming = Option.wrap(Terminable.many(
            ...capturing.map(input => Events.subscribe(input, "midimessage", (event: MIDIMessageEvent) => {
                const data = event.data
                if (isDefined(data) &&
                    this.#filterChannel.mapOr(channel => MidiData.readChannel(data) === channel, true)) {
                    const pitch = MidiData.readPitch(data)
                    if (MidiData.isNoteOn(data)) {
                        activeNotes[pitch]++
                        this.#notifier.notify(event)
                    } else if (MidiData.isNoteOff(data) && activeNotes[pitch] > 0) {
                        activeNotes[pitch]--
                        this.#notifier.notify(event)
                    }
                }
            })),
            Terminable.create(() => activeNotes.forEach((count, index) => {
                if (count > 0) {
                    for (let channel = 0; channel < 16; channel++) {
                        const event = new MessageEvent("midimessage", {data: MidiData.noteOff(channel, index)})
                        for (let i = 0; i < count; i++) {
                            this.#notifier.notify(event)
                        }
                    }
                }
            }))))
    }

    #stopStream(): void {
        this.#streaming.ifSome(terminable => terminable.terminate())
        this.#streaming = Option.None
    }
}