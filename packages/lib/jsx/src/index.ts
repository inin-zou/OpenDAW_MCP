const key = Symbol.for("@openDAW/lib-jsx")

if ((globalThis as any)[key]) {
    console.debug(`%c${key.description}%c is already available in ${globalThis.constructor.name}.`, "color: hsl(10, 83%, 60%)", "color: inherit")
} else {
    (globalThis as any)[key] = true
    console.debug(`%c${key.description}%c is now available in ${globalThis.constructor.name}.`, "color: hsl(200, 83%, 60%)", "color: inherit")
}

export * from "./types"
export * from "./create-element"
export * from "./inject"
export * from "./routes"
export * from "./std/Await"
export * from "./std/Frag"
export * from "./std/Group"
export * from "./std/Hotspot"
export * from "./std/HTML"
export * from "./std/LocalLink"
export * from "./std/Router"
export * from "./std/Preloader"