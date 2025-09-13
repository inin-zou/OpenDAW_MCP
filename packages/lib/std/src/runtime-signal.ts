import {Observer} from "./observers"
import {Notifier} from "./notifier"
import {Subscription} from "./terminable"

export namespace RuntimeSignal {
    export interface Signal {
        get type(): string
    }

    const notifier: Notifier<Signal> = new Notifier<Signal>()

    export const subscribe = (observer: Observer<Signal>): Subscription => notifier.subscribe(observer)

    export const dispatch = (signal: Signal): void => notifier.notify(signal)
}