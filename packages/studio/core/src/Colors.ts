import {InaccessibleProperty} from "@opendaw/lib-std"

const getPropertyValue = (() => {
    if (typeof document === "undefined") {
        // This will compile in React but fails at runtime when no document is available
        return (_property: string): string => InaccessibleProperty as unknown as string
    }
    const computedStyle = getComputedStyle(document.documentElement)
    return (property: string): string => computedStyle.getPropertyValue(property)
})()

export const Colors = {
    blue: getPropertyValue("--color-blue"),
    green: getPropertyValue("--color-green"),
    yellow: getPropertyValue("--color-yellow"),
    cream: getPropertyValue("--color-cream"),
    orange: getPropertyValue("--color-orange"),
    red: getPropertyValue("--color-red"),
    purple: getPropertyValue("--color-purple"),
    bright: getPropertyValue("--color-bright"),
    gray: getPropertyValue("--color-gray"),
    dark: getPropertyValue("--color-dark"),
    shadow: getPropertyValue("--color-shadow"),
    black: getPropertyValue("--color-black")
}