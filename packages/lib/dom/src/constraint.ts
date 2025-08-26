import {isUndefined, Nullish} from "@opendaw/lib-std"

export namespace ConstrainDOM {
    export const resolveString = (constrain: Nullish<ConstrainDOMString>): Nullish<string> => {
        if (isUndefined(constrain)) {return undefined}
        if (typeof constrain === "string") {return constrain}
        if (Array.isArray(constrain)) {return constrain.join(",")}
        if (typeof constrain === "object") {
            if (typeof constrain.exact === "string") {return constrain.exact}
            if (Array.isArray(constrain.exact)) {return constrain.exact.join(",")}
            if (typeof constrain.ideal === "string") { return constrain.ideal}
            if (Array.isArray(constrain.ideal)) {return constrain.ideal.join(",")}
        }
        return undefined
    }
}