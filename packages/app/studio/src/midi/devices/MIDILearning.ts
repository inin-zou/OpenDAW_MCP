import {
    byte,
    isDefined,
    isInstanceOf,
    JSONValue,
    Nullish,
    Observer,
    Provider,
    SortedSet,
    Terminable,
    Terminator,
    tryCatch
} from "@opendaw/lib-std"
import {AutomatableParameterFieldAdapter} from "@opendaw/studio-adapters"
import {MidiDeviceAccess} from "@/midi/devices/MidiDeviceAccess"
import {MidiDialogs} from "@/midi/devices/MidiDialogs"
import {Address, AddressJSON, PrimitiveField, PrimitiveValues} from "@opendaw/lib-box"
import {Pointers} from "@opendaw/studio-enums"
import {StudioService} from "@/service/StudioService"
import {Project} from "@opendaw/studio-core"
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
        if (!MidiDeviceAccess.canRequestMidiAccess()) {return}
        MidiDeviceAccess.available().setValue(true)
        const learnLifecycle = this.#terminator.spawn()
        const dialog = MidiDialogs.showInfoDialog(() => learnLifecycle.terminate())
        learnLifecycle.own(MidiDeviceAccess.subscribeMessageEvents((event: MIDIMessageEvent) => {
            const data = event.data
            if (data === null) {return}
            if (MidiData.isController(data)) {
                learnLifecycle.terminate()
                dialog.close()
                return this.#startListeningControl(field, MidiData.readChannel(data), MidiData.readParam1(data), event)
            }
        }))
    }

    saveToLocalStorage(key: string): void {
        localStorage.setItem(key, JSON.stringify(this.#service.midiLearning.toJSON()))
    }

    loadFromLocalStorage(key: string): boolean {
        const {status, value} =
            tryCatch(() => JSON.parse(localStorage.getItem(key) ?? "[]") as ReadonlyArray<MIDIConnectionJSON>)
        if (status === "failure") {return false}
        const hasData = value.length > 0
        if (hasData) {
            console.debug(`load ${value.length} midi-connections`)
        }
        this.fromJSON(value)
        return hasData
    }

    toJSON(): ReadonlyArray<MIDIConnectionJSON> {
        return this.#connections.values().map(connection => connection.toJSON())
    }

    fromJSON(json: ReadonlyArray<MIDIConnectionJSON>): void {
        this.#killAllConnections()
        this.#connections.addMany(json
            .map<Nullish<MIDIConnection>>((json) => {
                const {type, address: addressAsJson, channel} = json
                const address = Address.compose(Uint8Array.from(addressAsJson.uuid), ...addressAsJson.fields)
                const {project: {boxGraph}} = this.#service
                switch (type) {
                    case "control": {
                        return boxGraph.findVertex(address)
                                .ifSome(field => {
                                    if (!field.isField() || !isInstanceOf(field, PrimitiveField)) {return undefined}
                                    return this.#startListeningControl(field, channel, json?.controlId ?? 1)
                                })
                            ?? undefined
                    }
                }
            })
            .filter(x => isDefined(x)))
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
        const subscription = MidiDeviceAccess.subscribeMessageEvents(observer, channel)
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