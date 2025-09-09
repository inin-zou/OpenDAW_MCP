import {Arrays, assert, Func, isDefined, isInstanceOf, panic, SortedSet, UUID} from "@opendaw/lib-std"
import {Address} from "./address"
import {PointerField} from "./pointer"
import {Vertex} from "./vertex"
import {Box} from "./box"

export class GraphEdges {
    readonly #requiresTarget: SortedSet<Address, PointerField>
    readonly #requiresPointer: SortedSet<Address, Vertex>
    readonly #incoming: SortedSet<Address, [Address, Array<PointerField>]>
    readonly #outgoing: SortedSet<Address, [PointerField, Address]>

    constructor() {
        this.#requiresTarget = Address.newSet<PointerField>(source => source.address)
        this.#requiresPointer = Address.newSet<Vertex>(vertex => vertex.address)
        this.#incoming = Address.newSet<[Address, Array<PointerField>]>(([address]) => address)
        this.#outgoing = Address.newSet<[PointerField, Address]>(([source]) => source.address)
    }

    watchVertex(vertex: Vertex | PointerField): void {
        if (isInstanceOf(vertex, PointerField)) {
            if (!vertex.mandatory) {
                return panic("watchVertex called but has no edge requirement")
            }
            this.#requiresTarget.add(vertex)
        } else {
            if (!vertex.pointerRules.mandatory) {
                return panic("watchVertex called but has no edge requirement")
            }
            this.#requiresPointer.add(vertex)
        }
    }

    unwatchVerticesOf(...boxes: ReadonlyArray<Box>): void {
        const map: Func<Vertex, UUID.Bytes> = ({box: {address: {uuid}}}) => uuid
        for (const {address: {uuid}} of boxes) {
            this.#removeSameBox(this.#requiresTarget, uuid, map)
            this.#removeSameBox(this.#requiresPointer, uuid, map)
        }
        for (const box of boxes) {
            const outgoingLinks = this.outgoingEdgesOf(box)
            if (outgoingLinks.length > 0) {
                return panic(`${box} has outgoing edges: ${outgoingLinks.map(([source, target]) =>
                    `[${source.toString()}, ${target.toString()}]`)}`)
            }
            const incomingPointers = this.incomingEdgesOf(box)
            if (incomingPointers.length > 0) {
                return panic(`${box} has incoming edges from: ${incomingPointers.map((source: PointerField) =>
                    source.toString())}`)
            }
        }
    }

    connect(source: PointerField, target: Address): void {
        this.#outgoing.add([source, target])
        this.#incoming.opt(target).match<void>({
            none: () => this.#incoming.add([target, [source]]),
            some: ([, sources]) => sources.push(source)
        })
    }

    disconnect(source: PointerField): void {
        const [, target] = this.#outgoing.removeByKey(source.address)
        const [, sources] = this.#incoming.get(target)
        Arrays.remove(sources, source)
        if (sources.length === 0) {this.#incoming.removeByKey(target)}
    }

    outgoingEdgesOf(box: Box): ReadonlyArray<[PointerField, Address]> {
        return this.#collectSameBox(this.#outgoing, box.address.uuid, ([{box: {address: {uuid}}}]) => uuid)
    }

    incomingEdgesOf(vertex: Box | Vertex): ReadonlyArray<PointerField> {
        if (vertex.isBox()) {
            return this.#collectSameBox(this.#incoming, vertex.address.uuid, ([{uuid}]) => uuid)
                .flatMap(([_, pointers]) => pointers)
        } else {
            return this.#incoming.opt(vertex.address).mapOr(([_, pointers]) => pointers, Arrays.empty())
        }
    }

    validateRequirements(): void {
        this.#requiresTarget.forEach(pointer => {
            assert(pointer.isAttached(), `Pointer ${pointer.address.toString()} is not attached`)
            if (pointer.isEmpty()) {
                if (pointer.mandatory) {
                    return panic(`Pointer ${pointer.toString()} requires an edge.`)
                } else {
                    return panic(`Illegal state: ${pointer} has no edge requirements.`)
                }
            }
        })
        this.#requiresPointer.forEach(target => {
            assert(target.isAttached(), `Target ${target.address.toString()} is not attached`)
            if (target.pointerHub.isEmpty()) {
                if (target.pointerRules.mandatory) {
                    return panic(`Target ${target.toString()} requires an edge.`)
                } else {
                    return panic(`Illegal state: ${target} has no edge requirements.`)
                }
            }
        })
    }

    #collectSameBox<T>(set: SortedSet<Address, T>, id: UUID.Bytes, map: Func<T, UUID.Bytes>): ReadonlyArray<T> {
        const range = Address.boxRange(set, id, map)
        return isDefined(range) ? set.values().slice(range[0], range[1]) : Arrays.empty()
    }

    #removeSameBox<T>(set: SortedSet<Address, T>, id: UUID.Bytes, map: Func<T, UUID.Bytes>): void {
        const range = Address.boxRange(set, id, map)
        if (isDefined(range)) {set.removeRange(range[0], range[1])}
    }
}