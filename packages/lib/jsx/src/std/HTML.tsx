import {isDefined} from "@opendaw/lib-std"

export type HTMLSource = string | URL | Promise<Response>

const sanitizeFragment = (frag: DocumentFragment) => {
    frag.querySelectorAll("script").forEach(n => n.remove())
    frag.querySelectorAll("*").forEach(el => {
        for (const a of [...el.attributes]) {
            if (a.name.toLowerCase().startsWith("on")) el.removeAttribute(a.name)
        }
    })
}

export const HTML = ({src, className}: { src: HTMLSource, className?: string }) => {
    const placeholder = document.createElement("span")
    placeholder.hidden = true
    const load = async () => {
        let markup: string
        if (typeof src === "string") {
            markup = src
        } else if (src instanceof URL) {
            const r = await fetch(src.toString(), {credentials: "same-origin"})
            markup = await r.text()
        } else {
            markup = await src.then(x => x.text())
        }
        const range = document.createRange()
        const frag = range.createContextualFragment(markup)
        sanitizeFragment(frag)
        if (isDefined(className)) {
            for (const node of frag.childNodes) {
                if (node instanceof Element) {
                    node.classList.add(...className.split(/\s+/))
                }
            }
        }
        placeholder.replaceWith(frag)
    }
    load().finally()
    return placeholder
}