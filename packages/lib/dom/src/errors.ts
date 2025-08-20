import {panic} from "@opendaw/lib-std"

export namespace Errors {
    export const AbortError = typeof DOMException === "undefined"
        ? NaN : Object.freeze(new DOMException("AbortError"))

    export const isAbort = (error: unknown) =>
        error === AbortError || (error instanceof DOMException && error.name === "AbortError")

    export const CatchAbort = (error: unknown) => error === AbortError ? undefined : panic(error)
}