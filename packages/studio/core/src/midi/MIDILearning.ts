import {
    byte,
    isDefined,
    JSONValue,
    Observer,
    Provider,
    RuntimeNotifier,
    SortedSet,
    Terminable,
    Terminator
} from "@opendaw/lib-std"
import {Errors} from "@opendaw/lib-dom"
import {Address, AddressJSON, PrimitiveField, PrimitiveValues} from "@opendaw/lib-box"
import {MidiData} from "@opendaw/lib-midi"
import {Pointers} from "@opendaw/studio-enums"
import {AutomatableParameterFieldAdapter} from "@opendaw/studio-adapters"
import {Project} from "../project/Project"
import {MidiDevices} from "./MidiDevices"

export type MIDIConnectionJSON = ({ type: "control", controlId: byte })
    & { address: AddressJSON, channel: byte }
    & JSONValue

export interface MIDIConnection extends Terminable {
    address: Address
    label: Provider<string>
    toJSON(): MIDIConnectionJSON
}

interface MIDIObserver extends Terminable {observer: Observer<MIDIMessageEvent>}

export class MIDILearning implements Terminable {
    readonly #terminator = new Terminator()

    readonly #project: Project
    readonly #connections: SortedSet<Address, MIDIConnection>

    constructor(project: Project) {
        this.#project = project
        this.#connections = Address.newSet<MIDIConnection>(connection => connection.address)
    }

    hasMidiConnection(address: Address): boolean {return this.#connections.hasKey(address)}
    forgetMidiConnection(address: Address) {this.#connections.removeByKey(address).terminate()}

    async learnMIDIControls(field: PrimitiveField<PrimitiveValues, Pointers.MidiControl | Pointers>) {
        if (!MidiDevices.canRequestMidiAccess()) {return}
        await MidiDevices.requestPermission()
        const learnLifecycle = this.#terminator.spawn()
        const abortController = new AbortController()
        learnLifecycle.own(MidiDevices.subscribeMessageEvents((event: MIDIMessageEvent) => {
            const data = event.data
            if (data === null) {return}
            if (MidiData.isController(data)) {
                learnLifecycle.terminate()
                abortController.abort(Errors.AbortError)
                return this.#startListeningControl(field, MidiData.readChannel(data), MidiData.readParam1(data), event)
            }
        }))
        return RuntimeNotifier.info({
            headline: "Learn Midi Keys...",
            message: "Hit a key on your midi-device to learn a connection.",
            okText: "Cancel",
            abortSignal: abortController.signal
        }).then(() => learnLifecycle.terminate(), Errors.CatchAbort)
    }

    toJSON(): ReadonlyArray<MIDIConnectionJSON> {
        return this.#connections.values().map(connection => connection.toJSON())
    }

    terminate(): void {
        this.#killAllConnections()
        this.#terminator.terminate()
    }

    #startListeningControl(field: PrimitiveField<PrimitiveValues, Pointers.MidiControl | Pointers>,
                           channel: byte,
                           controlId: byte,
                           event?: MIDIMessageEvent): void {
        console.debug(`startListeningControl channel: ${channel}, controlId: ${controlId}`)
        const {observer, terminate} =
            this.#createMidiControlObserver(this.#project, this.#project.parameterFieldAdapters.get(field.address), controlId)
        if (isDefined(event)) {observer(event)}
        const subscription = MidiDevices.subscribeMessageEvents(observer, channel)
        this.#connections.add({
            address: field.address,
            toJSON: (): MIDIConnectionJSON => ({
                type: "control",
                address: field.address.toJSON(),
                channel,
                controlId
            }),
            label: () => this.#project.parameterFieldAdapters.get(field.address).name,
            terminate: () => {
                terminate()
                subscription.terminate()
            }
        })
    }

    #killAllConnections() {
        this.#connections.forEach(({terminate}) => terminate())
        this.#connections.clear()
    }

    #createMidiControlObserver(project: Project, adapter: AutomatableParameterFieldAdapter, controlId: byte): MIDIObserver {
        const registration = adapter.registerMidiControl()
        return {
            observer: (event: MIDIMessageEvent) => {
                const data = event.data
                if (data === null) {return}
                if (MidiData.isController(data) && MidiData.readParam1(data) === controlId) {
                    project.editing.modify(() => adapter.setValue(adapter.valueMapping.y(MidiData.asValue(data))), false)
                }
            },
            terminate: () => registration.terminate()
        }
    }
}