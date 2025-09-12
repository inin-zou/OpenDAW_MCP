import {Promises} from "./promises"
import {Errors, int, isInstanceOf} from "@opendaw/lib-std"

export namespace network {
    const limit = new Promises.Limit<Response>(4)

    export const limitFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        limit.add(() => fetch(input, init))

    export const DefaultRetry = (reason: unknown, count: int) => {
        return !isInstanceOf(reason, Errors.FileNotFound) || count <= 100
    }
}