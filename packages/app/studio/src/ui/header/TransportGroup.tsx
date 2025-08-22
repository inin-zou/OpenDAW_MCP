import css from "./TransportGroup.sass?inline"
import {Icon} from "@/ui/components/Icon.tsx"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService"
import {Button} from "@/ui/components/Button.tsx"
import {Lifecycle, Terminator} from "@opendaw/lib-std"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Colors} from "@opendaw/studio-core"
import {Checkbox} from "@/ui/components/Checkbox"
import {Surface} from "@/ui/surface/Surface"
import {CountIn} from "@/ui/header/CountIn"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "TransportGroup")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const TransportGroup = ({lifecycle, service}: Construct) => {
    const {engine, transport} = service
    const playButton: HTMLElement = (
        <Button lifecycle={lifecycle}
                appearance={{activeColor: "hsl(120, 50%, 60%)", tooltip: "Play"}}
                onClick={() => {
                    if (engine.isPlaying.getValue()) {
                        engine.stop()
                    } else {
                        engine.play()
                    }
                }}><Icon symbol={IconSymbol.Play}/></Button>
    )
    const recordButton: HTMLElement = (
        <Button lifecycle={lifecycle}
                appearance={{
                    activeColor: "hsl(0, 50%, 60%)",
                    tooltip: "Start Recording (Shift-Click to suppress count-in)"
                }}
                onClick={_event => {
                    // if (service.isRecording()) {
                    //     service.stopRecording()
                    // } else {
                    //     service.startRecording(!event.shiftKey)
                    // }
                }}><Icon symbol={IconSymbol.Record}/></Button>)
    const element: HTMLElement = (
        <div className={className}>
            {recordButton}
            {playButton}
            <Button lifecycle={lifecycle}
                    onClick={() => {engine.stop(true)}}
                    appearance={{activeColor: Colors.bright, tooltip: "Stop"}}>
                <Icon symbol={IconSymbol.Stop}/>
            </Button>
            <Checkbox lifecycle={lifecycle}
                      model={transport.loop}
                      appearance={{activeColor: Colors.gray, tooltip: "Loop"}}>
                <Icon symbol={IconSymbol.Loop}/>
            </Checkbox>
        </div>
    )
    const countInLifecycle = lifecycle.own(new Terminator())
    lifecycle.ownAll(
        engine.isPlaying.subscribe(owner => playButton.classList.toggle("active", owner.getValue())),
        engine.isRecording.subscribe(owner => recordButton.classList.toggle("active", owner.getValue())),
        engine.isCountingIn.subscribe(owner => {
            if (owner.getValue()) {
                Surface.get(recordButton).body.appendChild(CountIn({lifecycle: countInLifecycle, engine}))
            } else {
                countInLifecycle.terminate()
            }
        }),
        service.sessionService.catchupAndSubscribe(owner => element.classList.toggle("disabled", owner.getValue().isEmpty()))
    )
    return element
}