import css from "./FlexSpace.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "FlexSpace")

export const FlexSpace = () => (<div className={className}/>)