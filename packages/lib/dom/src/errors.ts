import {isRecord, panic} from "@opendaw/lib-std"

export namespace Errors {
    export const AbortError = typeof DOMException === "undefined"
        ? NaN : Object.freeze(new DOMException("AbortError"))

    export const isAbort = (error: unknown) =>
        error === AbortError || (error instanceof DOMException && error.name === "AbortError")

    export const CatchAbort = (error: unknown) => error === AbortError ? undefined : panic(error)

    // https://developer.mozilla.org/en-US/docs/Web/API/OverconstrainedError is not available in Firefox and Gecko
    export const isOverconstrained = (error: unknown): error is { constraint: string } =>
        isRecord(error) && "constraint" in error
}