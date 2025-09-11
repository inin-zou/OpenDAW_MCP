import {hasField, isRecord, panic} from "./lang"

export namespace Errors {
    export class Warning extends Error {}

    // Should be handled more gracefully from the user-interface
    export const warn = (issue: string): never => {throw new Warning(issue)}

    export class FileNotFound extends Error {constructor(path: string) {super(`${path} not found`)}}

    export const AbortError = typeof DOMException === "undefined"
        ? {name: "AbortError", message: ""} : Object.freeze(new DOMException("AbortError"))

    export const isAbort = (error: unknown): error is { name: string, message: string } =>
        error === AbortError || (isDOMException(error) && error.name === "AbortError")

    export const CatchAbort = (error: unknown) =>
        error === AbortError ? undefined : panic(error)

    // https://developer.mozilla.org/en-US/docs/Web/API/OverconstrainedError is not available in Firefox and Gecko
    export const isOverconstrained = (error: unknown): error is { constraint: string } =>
        isRecord(error) && "constraint" in error

    export const isDOMException = (error: unknown): error is { name: string, message: string } =>
        isRecord(error) &&
        hasField(error, "name", "string") &&
        hasField(error, "message", "string")
}