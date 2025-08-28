import css from "./DevicesBrowser.sass?inline"
import {isInstanceOf, Lifecycle, Objects, panic} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {DragAndDrop} from "@/ui/DragAndDrop"
import {DragDevice} from "@/ui/AnyDragData"
import {TextTooltip} from "@/ui/surface/TextTooltip"
import {DeviceHost, Devices} from "@opendaw/studio-adapters"
import {EffectFactories, EffectFactory, InstrumentFactories, Project} from "@opendaw/studio-core"
import {ModularBox} from "@opendaw/studio-boxes"
import {Icon} from "../components/Icon"

const className = Html.adoptStyleSheet(css, "DevicesBrowser")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const DevicesBrowser = ({lifecycle, service}: Construct) => {
    const {project} = service
    return (
        <div className={className}>
            <div className="resources">
                <section className="instrument">
                    <h1>Instruments</h1>
                    {createInstrumentList(lifecycle, project)}
                </section>
                <section className="audio">
                    <h1>Audio Effects</h1>
                    {createEffectList(lifecycle, service, project, Objects.exclude(EffectFactories.AudioNamed, "Modular"), "audio-effect")}
                </section>
                <section className="midi">
                    <h1>Midi Effects</h1>
                    {createEffectList(lifecycle, service, project, EffectFactories.MidiNamed, "midi-effect")}
                </section>
            </div>
            <div className="manual help-section">
                <section>
                    <h1>Creating an Instrument</h1>
                    <p>
                        To start making sound, click on an instrument from the list. This will create a new instance in
                        your
                        project.
                    </p>
                </section>
                <section>
                    <h1>Adding EffectFactories</h1>
                    <p>
                        Once an instrument is created, you can add effects. To do this, simply drag an effect
                        from the list and drop it into the instrument’s device chain.
                    </p>
                </section>
            </div>
        </div>
    )
}

const createInstrumentList = (lifecycle: Lifecycle, project: Project) => (
    <ul>{
        Object.entries(InstrumentFactories.Named).map(([key, factory]) => {
            const element = (
                <li onclick={() => project.editing.modify(() => project.api.createInstrument(factory))}>
                    <div className="icon">
                        <Icon symbol={factory.defaultIcon}/>
                    </div>
                    {factory.defaultName}
                </li>
            )
            lifecycle.ownAll(
                DragAndDrop.installSource(element, () => ({
                    type: "instrument",
                    device: key as InstrumentFactories.Keys,
                    copy: true
                } satisfies DragDevice)),
                TextTooltip.simple(element, () => {
                    const {bottom, left} = element.getBoundingClientRect()
                    return {clientX: left, clientY: bottom + 12, text: factory.description}
                })
            )
            return element
        })
    }</ul>
)

const createEffectList = <
    R extends Record<string, EffectFactory>,
    T extends DragDevice["type"]>(lifecycle: Lifecycle, service: StudioService, project: Project, records: R, type: T): HTMLUListElement => (
    <ul>{
        Object.entries(records).map(([key, entry]) => {
            const element = (
                <li onclick={() => {
                    const {boxAdapters, editing, userEditingManager} = project
                    userEditingManager.audioUnit.get().ifSome(vertex => {
                        const deviceHost: DeviceHost = boxAdapters.adapterFor(vertex.box, Devices.isHost)
                        if (type === "midi-effect" && deviceHost.inputAdapter.mapOr(input => input.accepts !== "midi", true)) {
                            return
                        }
                        const effectField =
                            type === "audio-effect" ? deviceHost.audioEffects.field()
                                : type === "midi-effect" ? deviceHost.midiEffects.field()
                                    : panic(`Unknown ${type}`)
                        editing.modify(() => {
                            const box = entry.create(project, effectField, effectField.pointerHub.incoming().length)
                            if (isInstanceOf(box, ModularBox)) {
                                service.switchScreen("modular")
                            }
                            return box
                        })
                    })
                }}>
                    <div className="icon">
                        <Icon symbol={entry.defaultIcon}/>
                    </div>
                    {entry.defaultName}
                </li>
            )
            lifecycle.ownAll(
                DragAndDrop.installSource(element, () => ({
                    type: type as any,
                    start_index: null,
                    device: key as keyof typeof EffectFactories.MergedNamed
                } satisfies DragDevice)),
                TextTooltip.simple(element, () => {
                    const {bottom, left} = element.getBoundingClientRect()
                    return {clientX: left, clientY: bottom + 12, text: entry.description}
                })
            )
            return element
        })
    }</ul>
)