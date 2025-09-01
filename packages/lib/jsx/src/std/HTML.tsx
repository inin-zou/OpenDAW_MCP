import {EmptyExec, isDefined} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import sanitize = Html.sanitize

export type HTMLSource = string | URL | Promise<Response>

export const HTML = ({src, className}: { src: HTMLSource, className?: string }) => {
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
        markup = markup
            .replace(/^\uFEFF/, "") // BOM
            .replace(/^\s*<\?xml[\s\S]*?\?>\s*/i, "") // XML prolog
            .replace(/^\s*<!DOCTYPE[\s\S]*?>\s*/i, "") // DOCTYPE
        const frag = document.createElement("div")
        // console.debug(markup)
        frag.innerHTML = markup
        sanitize(frag)
        if (isDefined(className)) {
            for (const node of frag.childNodes) {
                if (node instanceof Element) {
                    node.classList.add(...className.split(/\s+/))
                }
            }
        }
        placeholder.replaceWith(...frag.childNodes)
    })().catch(EmptyExec)
    return placeholder
}