import {PointerField, PointerTypes} from "./pointer"
import {Vertex} from "./vertex"
import {Exec, int, Iterables, Listeners, Option, panic, SortedSet, Subscription} from "@opendaw/lib-std"
import {Address} from "./address"

export interface PointerListener {
    onAdd(pointer: PointerField): void
    onRemove(pointer: PointerField): void
}

type ChangeLog = Array<{ type: "add" | "remove", pointerField: PointerField }>

export class PointerHub {
    static validate(pointer: PointerField, target: Vertex): Option<string> {
        if (pointer.address.equals(target.address)) {
            return Option.wrap(`PointerField cannot point to itself: ${pointer}`)
        }
        if (!target.pointerRules.accepts.some((type: PointerTypes): boolean => type === pointer.pointerType)) {
            const accepting = target.pointerRules.accepts.join(", ")
            return Option.wrap(`${String(pointer.pointerType)} does not satisfy any of the allowed types (${accepting}).`)
        }
        return Option.None
    }

    readonly #vertex: Vertex

    readonly #immediateListeners: Listeners<PointerListener>
    readonly #transactualListeners: Listeners<PointerListener>

    #inTransaction: Option<ChangeLog> = Option.None

    constructor(vertex: Vertex) {
        this.#vertex = vertex

        this.#immediateListeners = new Listeners<PointerListener>()
        this.#transactualListeners = new Listeners<PointerListener>()
    }

    subscribeImmediate(listener: PointerListener, ...filter: ReadonlyArray<PointerTypes>): Subscription {
        return this.#addFilteredListener(this.#immediateListeners, listener, filter)
    }

    subscribeTransactual(listener: PointerListener, ...filter: ReadonlyArray<PointerTypes>): Subscription {
        return this.#addFilteredListener(this.#transactualListeners, listener, filter)
    }

    catchupAndSubscribeTransactual(listener: PointerListener, ...filter: ReadonlyArray<PointerTypes>): Subscription {
        const added: SortedSet<Address, PointerField> = Address.newSet(pointer => pointer.address)
        added.addMany(this.filter(...filter))
        added.forEach(pointer => listener.onAdd(pointer))
        // This takes track of the listener notification state.
        // It is possible that the pointer has been added, but it has not been notified yet.
        // That would cause the listener.onAdd method to be invoked twice.
        return this.subscribeTransactual({
            onAdd: (pointer: PointerField) => {
                if (added.add(pointer)) {
                    listener.onAdd(pointer)
                }
            },
            onRemove: (pointer: PointerField) => {
                added.removeByKey(pointer.address)
                listener.onRemove(pointer)
            }
        }, ...filter)
    }

    filter<P extends PointerTypes>(...types: ReadonlyArray<P>): Array<PointerField<P>> {
        return (types.length === 0 ? this.incoming() : Iterables.filter(this.incoming().values(),
            (pointerField: PointerField) => types.some((type: P) =>
                type === pointerField.pointerType))) as Array<PointerField<P>>
    }

    size(): int {return this.incoming().length}
    isEmpty(): boolean {return this.size() === 0}
    nonEmpty(): boolean {return this.size() > 0}
    contains(pointer: PointerField): boolean {return this.incoming().some(incoming => pointer.address.equals(incoming.address))}
    incoming(): ReadonlyArray<PointerField> {return this.#vertex.graph.edges().incomingEdgesOf(this.#vertex)}

    onAdded(pointerField: PointerField): void {
        const issue: Option<string> = PointerHub.validate(pointerField, this.#vertex)
        if (issue.nonEmpty()) {return panic(issue.unwrap())}
        if (this.#inTransaction.isEmpty()) {
            this.#inTransaction = Option.wrap([{type: "add", pointerField}])
            this.#vertex.graph.subscribeEndTransaction(this.#onEndTransaction)
        } else {
            this.#inTransaction.unwrap().push({type: "add", pointerField})
        }
        this.#immediateListeners.proxy.onAdd(pointerField)
    }

    onRemoved(pointerField: PointerField): void {
        if (this.#inTransaction.isEmpty()) {
            this.#inTransaction = Option.wrap([{type: "remove", pointerField}])
            this.#vertex.graph.subscribeEndTransaction(this.#onEndTransaction)
        } else {
            this.#inTransaction.unwrap().push({type: "remove", pointerField})
        }
        this.#immediateListeners.proxy.onRemove(pointerField)
    }

    toString(): string {
        return `{Pointers ${this.#vertex.address}, pointers: ${this.incoming().values()
            .map((pointerField: PointerField) => pointerField.toString())}}`
    }

    #addFilteredListener(listeners: Listeners<PointerListener>,
                         listener: PointerListener,
                         filter: ReadonlyArray<PointerTypes>): Subscription {
        return listeners.subscribe({
            onAdd: (pointer: PointerField) => {
                if (filter.length === 0 || filter.some((type: PointerTypes): boolean => type === pointer.pointerType)) {
                    listener.onAdd(pointer)
                }
            },
            onRemove: (pointer: PointerField) => {
                if (filter.length === 0 || filter.some((type: PointerTypes): boolean => type === pointer.pointerType)) {
                    listener.onRemove(pointer)
                }
            }
        })
    }

    readonly #onEndTransaction: Exec = (): void => {
        if (this.#vertex.isAttached()) {
            const log: ChangeLog = this.#inTransaction.unwrap("Callback without ChangeLog")
            log.forEach(({type, pointerField}) => {
                if (type === "add") {
                    this.#transactualListeners.proxy.onAdd(pointerField)
                } else if (type === "remove") {
                    this.#transactualListeners.proxy.onRemove(pointerField)
                } else {
                    panic(`Unknown type: ${type}`)
                }
            })
            log.length = 0
        }
        this.#inTransaction = Option.None
    }
}