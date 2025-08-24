import css from "./PeakVolumeSlider.sass?inline"
import {AnimationFrame, Html} from "@opendaw/lib-dom"
import {Lifecycle, ValueMapping} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {CanvasPainter} from "@/ui/canvas/painter"
import {Colors} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "PeakVolumeSlider")

type Construct = {
    lifecycle: Lifecycle
    peaks: Float32Array
}

export const PeakVolumeSlider = ({lifecycle, peaks}: Construct) => {
    const canvas: HTMLCanvasElement = <canvas/>
    const mapping = ValueMapping.linear(-48, 9)
    const s0 = mapping.x(-12)
    const s1 = mapping.x(0)
    const peakPainter = new CanvasPainter(canvas, painter => {
        const {context, actualWidth, actualHeight} = painter
        context.clearRect(0, 0, actualWidth, actualHeight)
        const gradient = context.createLinearGradient(0, 0, actualWidth, 0)
        gradient.addColorStop(s0, Colors.green)
        gradient.addColorStop(s0, Colors.yellow)
        gradient.addColorStop(s1, Colors.yellow)
        gradient.addColorStop(s1, Colors.orange)
        context.fillStyle = gradient
        console.debug(peaks.length)
        peaks.forEach((peak, index) => {
            const h = actualHeight / peaks.length
            context.fillRect(0, index * (h + 0.5), actualWidth * mapping.x(peak), h - 1)
        })
    })
    lifecycle.ownAll(
        peakPainter,
        AnimationFrame.add(peakPainter.requestUpdate)
    )
    return (
        <div className={className}>
            {canvas}
        </div>
    )
}