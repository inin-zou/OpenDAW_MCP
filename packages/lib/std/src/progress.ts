import {int, panic, Procedure, unitValue} from "./lang"
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

    export const splitWithWeights = (progress: Handler, weights: ReadonlyArray<number>): ReadonlyArray<Handler> => {
        const count = weights.length
        const collect = new Float32Array(count)
        if (weights.length === 0) {return panic("Weights must not be empty")}
        if (weights.some(w => w <= 0)) {return panic("Weights must be greater than zero")}
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0.0)
        const normalizedWeights = weightSum > 0
            ? weights.map(w => w / weightSum)
            : Arrays.create(() => 1.0 / count, count)
        return Arrays.create(index => (value: number) => {
            collect[index] = value
            progress(collect.reduce((total, v, i) => total + v * normalizedWeights[i], 0))
        }, count)
    }
}