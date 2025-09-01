import {EmptyExec, isDefined} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import sanitize = Html.sanitize

export type HTMLSource = string | URL | Promise<Response>

export const HTML = ({src, className, debug}: { src: HTMLSource, className?: string, debug?: boolean }) => {
    const placeholder = document.createElement("span")
    ;(async () => {
        let markup: string
        if (typeof src === "string") {
            markup = src
        } else if (src instanceof URL) {
            const response = await fetch(src.toString(), {credentials: "same-origin"})
            markup = await response.text()
        } else {
            markup = await src.then(x => x.text())
        }
        if (debug)
            console.debug("[SVG] before-parse",
                {hasViewBoxText: /\bviewBox\s*=/.test(markup), head: markup.slice(0, 120)})
        const frag = document.createElement("div")
        frag.innerHTML = markup
        const svg0 = frag.querySelector("svg")
        if (debug)
            console.debug("[SVG] after-parse(before sanitize)",
                {ns: svg0?.namespaceURI, attrs: svg0 ? svg0.getAttributeNames() : []})
        sanitize(frag)
        const svg1 = frag.querySelector("svg")
        if (debug)
            console.debug("[SVG] after-sanitize",
                {ns: svg1?.namespaceURI, attrs: svg1 ? svg1.getAttributeNames() : []})
        if (isDefined(className)) {
            for (const node of frag.childNodes) {
                if (node instanceof Element) {
                    node.classList.add(...className.split(/\s+/))
                }
            }
        }
        placeholder.replaceWith(...Array.from(frag.childNodes))
    })().catch(EmptyExec)
    return placeholder
}