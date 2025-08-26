import {Subscription, Terminable} from "./terminable"
import {Notifier} from "./notifier"
import {Option} from "./option"
import {Func, isDefined, Nullable, Nullish, Procedure, ValueOrProvider} from "./lang"
import {Bijective} from "./bijective"
import {Observer} from "./observers"

export interface Observable<VALUE> {
    subscribe(observer: Observer<VALUE>): Subscription
}

export interface ObservableValue<T> extends Observable<ObservableValue<T>> {
    getValue(): T
    catchupAndSubscribe(observer: Observer<ObservableValue<T>>): Subscription
}

export namespace ObservableValue {
    export const make = <T>(value: T): ObservableValue<T> => new class implements ObservableValue<T> {
        getValue(): T {return value}
        subscribe(_observer: Observer<ObservableValue<T>>): Subscription {return Terminable.Empty}
        catchupAndSubscribe(observer: Observer<ObservableValue<T>>): Subscription {
            observer(this)
            return Terminable.Empty
        }
    }
}

export interface MutableObservableValue<T> extends ObservableValue<T> {
    setValue(value: T): void
}

export namespace MutableObservableValue {
    export const False: MutableObservableValue<boolean> =
        new class implements MutableObservableValue<boolean> {
            getValue() {return false}
            setValue(_: boolean): void {}
            subscribe(_: Observer<ObservableValue<boolean>>) {return Terminable.Empty}
            catchupAndSubscribe(observer: Observer<ObservableValue<boolean>>) {
                observer(this)
                return Terminable.Empty
            }
        }

    export const inverseBoolean = (observableValue: MutableObservableValue<boolean>): MutableObservableValue<boolean> =>
        new class implements MutableObservableValue<boolean> {
            getValue() {return !observableValue.getValue()}
            setValue(value: boolean): void {observableValue.setValue(!value)}
            subscribe(observer: Observer<ObservableValue<boolean>>) {return observableValue.subscribe(observer)}
            catchupAndSubscribe(observer: Observer<ObservableValue<boolean>>) {
                observer(this)
                return this.subscribe(observer)
            }
        }
}

export class ObservableOption<T> implements Option<T>, Observable<Option<T>>, Terminable {
    readonly #notifier: Notifier<Option<T>>

    #option: Option<T> = Option.None

    constructor(value?: T) {
        this.#notifier = new Notifier<Option<T>>()
        this.wrap(value)
    }

    wrap(value: Nullish<T>): void {
        const next = Option.wrap(value)
        if (!this.#option.equals(next)) {
            this.#option = next
            this.#notifier.notify(this)
        }
    }

    clear(procedure?: Procedure<T>): void {
        if (this.#option.isEmpty()) {return}
        if (isDefined(procedure)) {procedure(this.#option.unwrap())}
        this.#option = Option.None
        this.#notifier.notify(this)
    }

    assert(fail?: ValueOrProvider<string>): this {
        this.#option.assert(fail)
        return this
    }

    contains(value: T): boolean {return this.#option.contains(value)}
    equals(other: Option<T>): boolean {return this.#option.equals(other)}
    flatMap<U>(func: Func<T, Option<U>>): Option<U> {return this.#option.flatMap(func)}
    ifSome<R>(procedure: Procedure<T>): R | undefined {return this.#option.ifSome(procedure)}
    isEmpty(): boolean {return this.#option.isEmpty()}
    map<U>(func: Func<T, U>): Option<U> {return this.#option.map(func)}
    mapOr<U>(func: Func<T, U>, or: ValueOrProvider<U>): U {return this.#option.mapOr(func, or)}
    match<R>(matchable: Option.Matchable<T, R>): R {return this.#option.match(matchable)}
    nonEmpty(): boolean {return this.#option.nonEmpty()}
    unwrap(fail?: ValueOrProvider<string>): T {return this.#option.unwrap(fail)}
    unwrapOrElse(or: ValueOrProvider<T>): T {return this.#option.unwrapOrElse(or)}
    unwrapOrNull(): Nullable<T> {return this.#option.unwrapOrNull()}
    unwrapOrUndefined(): T | undefined {return this.#option.unwrapOrUndefined()}
    subscribe(observer: Observer<Option<T>>): Subscription {return this.#notifier.subscribe(() => observer(this))}
    catchupAndSubscribe(observer: Observer<Option<T>>): Subscription {
        observer(this)
        return this.#notifier.subscribe(() => observer(this))
    }
    terminate(): void {this.#notifier.terminate()}
}

export class MappedMutableObservableValue<SOURCE, TARGET> implements MutableObservableValue<TARGET>, Terminable {
    readonly #source: MutableObservableValue<SOURCE>
    readonly #mapping: Bijective<SOURCE, TARGET>
    readonly #notifier: Notifier<TARGET>
    readonly #subscription: Subscription

    constructor(source: MutableObservableValue<SOURCE>, mapping: Bijective<SOURCE, TARGET>) {
        this.#source = source
        this.#mapping = mapping

        this.#notifier = new Notifier()
        this.#subscription = this.#source.catchupAndSubscribe(() => this.#notifier.notify(this.getValue()))
    }

    catchupAndSubscribe(observer: Observer<ObservableValue<TARGET>>): Subscription {
        observer(this)
        return this.subscribe(observer)
    }

    getValue(): TARGET {return this.#mapping.fx(this.#source.getValue())}
    setValue(value: TARGET): void {this.#source.setValue(this.#mapping.fy(value))}

    subscribe(observer: Observer<ObservableValue<TARGET>>): Subscription {
        return this.#notifier.subscribe(() => observer(this))
    }

    terminate(): void {this.#subscription.terminate()}
}

export interface ValueGuard<T> {guard(value: T): T}

export class DefaultObservableValue<T> implements MutableObservableValue<T>, Terminable {
    readonly #notifier: Notifier<ObservableValue<T>>

    readonly #guard: Option<ValueGuard<any>> = Option.None

    #value: T

    constructor(value: T, guard?: ValueGuard<T>) {
        this.#notifier = new Notifier<ObservableValue<T>>()
        this.#value = guard?.guard(value) ?? value
        this.#guard = Option.wrap(guard)
    }

    setValue(value: T): void {
        if (this.#guard.nonEmpty()) {value = this.#guard.unwrap().guard(value)}
        if (this.#value === value) {return}
        this.#value = value
        this.#notifier.notify(this)
    }
    getValue(): T {return this.#value}
    subscribe(observer: Observer<ObservableValue<T>>): Terminable {return this.#notifier.subscribe(observer)}
    catchupAndSubscribe(observer: Observer<ObservableValue<T>>): Terminable {
        observer(this)
        return this.#notifier.subscribe(observer)
    }
    terminate(): void {this.#notifier.terminate()}
    toString(): string {return `{DefaultObservableValue value: ${this.#value}`}
}