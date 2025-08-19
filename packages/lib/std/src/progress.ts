import {int, Procedure, unitValue} from "./lang"
import {Arrays} from "./arrays"

export namespace Progress {
    export type Handler = Procedure<unitValue>

    export const Empty: Handler = Object.freeze(_ => {})

    export const split = (progress: Handler, count: int): ReadonlyArray<Handler> => {
        const collect = new Float32Array(count)
        return Arrays.create(index => (value: number) => {
            collect[index] = value
            progress(collect.reduce((total, value) => total + value, 0.0) / count)
        }, count)
    }
}