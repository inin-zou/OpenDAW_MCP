import css from "./Cover.sass?inline"
import {EmptyExec, isDefined, Lifecycle, ObservableOption, panic} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Icon} from "../components/Icon"
import {IconSymbol} from "@opendaw/studio-adapters"
import {showInfoDialog} from "@/ui/components/dialogs"
import {Errors, Events, Files, Html} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"

const className = Html.adoptStyleSheet(css, "Cover")

type Construct = {
    lifecycle: Lifecycle
    model: ObservableOption<ArrayBuffer>
}

export const Cover = ({lifecycle, model}: Construct) => {
    const placeholder = "/cover.png"
    const editIcon: Element = <Icon symbol={IconSymbol.EditBox} className="edit-icon"/>
    const image: HTMLImageElement = (<img src={placeholder} alt="Cover"/>)
    lifecycle.ownAll(
        model.catchupAndSubscribe(owner => {
            image.src = owner.match({
                none: () => placeholder,
                some: buffer => buffer.byteLength === 0 ? placeholder : URL.createObjectURL(new Blob([buffer]))
            })
        }),
        Events.subscribe(editIcon, "click", async () => {
            const {status, value, error} = await Promises.tryCatch(Files.open())
            if (status === "rejected") {
                if (!Errors.isAbort(error)) {return panic(String(error))}
                return
            }
            const file = value?.at(0)
            if (!isDefined(file)) {return}
            if (file.size > (1 << 20) * 4) {
                showInfoDialog({headline: "Cover", message: "Image is too large. Keep it below 4mb."}).catch(EmptyExec)
                return
            }
            const fallback = image.src
            image.onerror = () => {
                image.onerror = null
                image.src = fallback
                showInfoDialog({headline: "Cover", message: `Unknown image format (${file.type}).`}).catch(EmptyExec)
            }
            model.wrap(await file.arrayBuffer())
        })
    )
    return (
        <div className={className}>
            {editIcon}
            {image}
        </div>
    )
}