import css from "./PianoRoll.sass?inline"
import {Events, Html} from "@opendaw/lib-dom"
import {createElement, Group} from "@opendaw/lib-jsx"
import {PianoRollLayout} from "@/ui/piano-panel/PianoRollLayout.ts"
import {isDefined, isInstanceOf, Lifecycle, Notifier} from "@opendaw/lib-std"
import {LoopableRegion, PPQN, ppqn} from "@opendaw/lib-dsp"
import {NoteRegionBoxAdapter} from "@opendaw/studio-adapters"
import {StudioService} from "@/service/StudioService"

const className = Html.adoptStyleSheet(css, "PianoRoll")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    updateNotifier: Notifier<void>
}

export const PianoRoll = ({lifecycle, service, updateNotifier}: Construct) => {
    const {WhiteKey, BlackKey} = PianoRollLayout
    const {project} = service
    const {engine, rootBoxAdapter: {pianoMode: {keyboard, transpose}}} = project
    const position = engine.position
    const getPianoLayout = () => PianoRollLayout.Defaults()[keyboard.getValue()]
    const createSVG = (): SVGSVGElement => {
        const pianoLayout = getPianoLayout()
        return (
            <svg classList={className}
                 viewBox={`0.5 0 ${pianoLayout.whiteKeys.length * WhiteKey.width - 1} ${(WhiteKey.height)}`}
                 width="100%">
                {pianoLayout.whiteKeys.map(({key, x}) => (
                    <rect classList="white" data-key={key} x={x + 0.5} y={0}
                          width={WhiteKey.width - 1} height={WhiteKey.height}/>
                ))}
                {pianoLayout.blackKeys.map(({key, x}) => (
                    <rect classList="black" data-key={key} x={x} y={0}
                          width={BlackKey.width} height={BlackKey.height}/>
                ))}
            </svg>
        )
    }
    let svg: SVGSVGElement = createSVG()
    const update = (position: ppqn) => {
        svg.querySelectorAll<SVGRectElement>("rect.playing")
            .forEach(rect => {
                rect.style.removeProperty("fill")
                rect.classList.remove("playing")
            })
        const pianoLayout = getPianoLayout()
        project.rootBoxAdapter.audioUnits.adapters().forEach(audioUnitAdapter => {
            const trackBoxAdapters = audioUnitAdapter.tracks.values()
                .filter(adapter => !adapter.box.excludePianoMode.getValue())
            trackBoxAdapters
                .forEach(trackAdapter => {
                    const region = trackAdapter.regions.collection.lowerEqual(position)
                    if (region === null || !isInstanceOf(region, NoteRegionBoxAdapter) || position >= region.complete) {
                        return
                    }
                    const collection = region.optCollection.unwrap()
                    const events = collection.events
                    const loopIterator = LoopableRegion.locateLoops(region, position, position)
                    for (const {resultStart, resultEnd, rawStart} of loopIterator) {
                        const searchStart = Math.floor(resultStart - rawStart)
                        const searchEnd = Math.floor(resultEnd - rawStart)
                        for (const note of events.iterateRange(searchStart - collection.maxDuration, searchEnd)) {
                            if (note.position + rawStart <= position && position < note.complete + rawStart) {
                                const pitch = note.pitch + transpose.getValue()
                                if (pitch < pianoLayout.min || pitch > pianoLayout.max) {continue}
                                const rect = svg.querySelector<SVGRectElement>(`[data-key="${pitch}"]`)
                                if (isDefined(rect)) {
                                    rect.style.fill = pianoLayout.getFillStyle(region.hue, true)
                                    rect.classList.add("playing")
                                }
                            }
                        }
                    }
                })
        })
    }
    const placeholder: Element = <Group>{svg}</Group>
    lifecycle.ownAll(
        keyboard.subscribe(() => {
            svg.remove()
            svg = createSVG()
            placeholder.appendChild(svg)
        }),
        // TODO We need a way to subscribe to all surfaces (this will fail when popping out into a new window)
        Events.subscribe(self, "keydown", event => {
            if (Events.isTextInput(event.target)) {return}
            if (event.code === "ArrowUp") {
                const ppqn = position.getValue() + PPQN.Quarter
                engine.setPosition(Math.max(0, ppqn))
            } else if (event.code === "ArrowDown") {
                const ppqn = position.getValue() - PPQN.Quarter
                engine.setPosition(Math.max(0, ppqn))
            }
        }, {capture: true}),
        updateNotifier.subscribe(() => update(position.getValue()))
    )
    update(position.getValue())
    return placeholder
}