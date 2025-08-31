import {describe, expect, it} from "vitest"
import {asEnumValue} from "./lang"

describe("lang", () => {
    it("asEnumValue", () => {
        enum Strings {A = "EA", B = "EB",}

        enum Numbers {A = 0, B = 1,}

        enum Mixed {A = "AE", B = 1}

        expect(asEnumValue("EA", Strings)).toBe(Strings.A)
        expect(asEnumValue("EB", Strings)).toBe(Strings.B)
        expect(asEnumValue(0, Numbers)).toBe(Numbers.A)
        expect(asEnumValue(1, Numbers)).toBe(Numbers.B)
        expect(() => asEnumValue(2, Numbers)).throws()
        expect(asEnumValue("AE", Mixed)).toBe(Mixed.A)
        expect(asEnumValue(1, Mixed)).toBe(Mixed.B)
    })
})