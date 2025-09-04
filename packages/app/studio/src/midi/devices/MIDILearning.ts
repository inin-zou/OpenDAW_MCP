import {byte, isDefined, JSONValue, Observer, Provider, SortedSet, Terminable, Terminator} from "@opendaw/lib-std"
import {AutomatableParameterFieldAdapter} from "@opendaw/studio-adapters"
import {MidiDialogs} from "@/midi/devices/MidiDialogs"
import {Address, AddressJSON, PrimitiveField, PrimitiveValues} from "@opendaw/lib-box"
import {Pointers} from "@opendaw/studio-enums"
import {StudioService} from "@/service/StudioService"
import {MidiDevices, Project} from "@opendaw/studio-core"
import {MidiData} from "@opendaw/lib-midi"

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

    readonly #service: StudioService
    readonly #connections: SortedSet<Address, MIDIConnection>

    constructor(service: StudioService) {
        this.#service = service
        this.#connections = Address.newSet<MIDIConnection>(connection => connection.address)
    }

    hasMidiConnection(address: Address): boolean {return this.#connections.hasKey(address)}
    forgetMidiConnection(address: Address) {this.#connections.removeByKey(address).terminate()}

    async learnMIDIControls(field: PrimitiveField<PrimitiveValues, Pointers.MidiControl | Pointers>) {
        if (!MidiDevices.canRequestMidiAccess()) {return}
        await MidiDevices.requestPermission()
        const learnLifecycle = this.#terminator.spawn()
        const dialog = MidiDialogs.showInfoDialog(() => learnLifecycle.terminate())
        learnLifecycle.own(MidiDevices.subscribeMessageEvents((event: MIDIMessageEvent) => {
            const data = event.data
            if (data === null) {return}
            if (MidiData.isController(data)) {
                learnLifecycle.terminate()
                dialog.close()
                return this.#startListeningControl(field, MidiData.readChannel(data), MidiData.readParam1(data), event)
            }
        }))
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
        const {project} = this.#service
        const {observer, terminate} =
            this.#createMidiControlObserver(project, project.parameterFieldAdapters.get(field.address), controlId)
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
            label: () => project.parameterFieldAdapters.get(field.address).name,
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