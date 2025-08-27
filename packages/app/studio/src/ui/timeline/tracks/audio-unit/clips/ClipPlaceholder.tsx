import {DefaultObservableValue, isDefined, Lifecycle, Nullable, Terminator} from "@opendaw/lib-std"
import {createElement, Group} from "@opendaw/lib-jsx"
import {AnyClipBoxAdapter} from "@opendaw/studio-adapters"
import {Clip} from "@/ui/timeline/tracks/audio-unit/clips/Clip.tsx"
import {Html} from "@opendaw/lib-dom"
import {Project} from "@opendaw/studio-core"

type Construct = {
    lifecycle: Lifecycle
    project: Project
    adapter: DefaultObservableValue<Nullable<AnyClipBoxAdapter>>
    gridColumn: string
}

export const ClipPlaceholder = ({lifecycle, project, adapter, gridColumn}: Construct) => {
    const element: HTMLElement = <Group/>
    const terminator = lifecycle.own(new Terminator())
    lifecycle.own(
        adapter.catchupAndSubscribe(owner => {
            Html.empty(element)
            terminator.terminate()
            const adapter = owner.getValue()
            if (isDefined(adapter)) {
                element.appendChild(<Clip lifecycle={terminator} project={project} adapter={adapter}
                                          gridColumn={gridColumn}/>)
            } else {
                element.appendChild(<div className="placeholder" style={{gridColumn}}/>)
            }
        }))
    return element
}