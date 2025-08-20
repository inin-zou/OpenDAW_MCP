import {describe, expect, it} from "vitest"
import {ifDefined, isEnumValue, isValidIdentifier} from "./lang"

describe("lang", () => {
    it("isValidIdentifier", () => {
        expect(isValidIdentifier("")).false
        expect(isValidIdentifier("42")).false
        expect(isValidIdentifier("-")).false
        expect(isValidIdentifier("+")).false
        expect(isValidIdentifier("/")).false
        expect(isValidIdentifier("|")).false
        expect(isValidIdentifier("$")).true
        expect(isValidIdentifier("A")).true
        expect(isValidIdentifier("$0")).true
    })
    it("ifDefined", () => {
        const abc = undefined
        const def = "def"
        expect(ifDefined(abc, value => value + "+")).toBeUndefined()
        expect(ifDefined(def, value => value + "+")).toBe("def+")
    })
    it("isEnumValue", () => {
        enum Strings {
            A = "A",
            B = "B",
        }

        enum Numbers {
            A = 0,
            B = 1,
        }

        expect(isEnumValue(Strings, "A")).true
        expect(isEnumValue(Strings, "B")).true
        expect(isEnumValue(Strings, "C")).false
        expect(isEnumValue(Strings, 0)).false

        expect(isEnumValue(Numbers, 0)).true
        expect(isEnumValue(Numbers, 1)).true
        expect(isEnumValue(Numbers, 2)).false
        expect(isEnumValue(Numbers, "A")).false
    })
})