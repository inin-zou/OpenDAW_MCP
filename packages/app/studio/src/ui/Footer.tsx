import css from "./Footer.sass?inline"
import {createElement, LocalLink} from "@opendaw/lib-jsx"
import {isDefined, Lifecycle, Terminator, TimeSpan} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService"
import {Surface} from "@/ui/surface/Surface"
import {Events, Html} from "@opendaw/lib-dom"
import {Runtime} from "@opendaw/lib-runtime"
import {FooterLabel} from "@/service/FooterLabel"
import {Colors, ProjectMeta} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "footer")

type Construct = { lifecycle: Lifecycle, service: StudioService }

export const Footer = ({lifecycle, service}: Construct) => {
    const labelOnline: HTMLElement = (<div title="Online"/>)
    const updateOnline = () => labelOnline.textContent = navigator.onLine ? "Yes" : "No"
    lifecycle.ownAll(
        Events.subscribe(window, "online", updateOnline),
        Events.subscribe(window, "offline", updateOnline)
    )
    updateOnline()
    const labelName: HTMLElement = (
        <div className="name"
             title="Project"
             ondblclick={(event) => {
                 const optProfile = service.profileService.getValue()
                 if (optProfile.isEmpty()) {return}
                 const profile = optProfile.unwrap()
                 const name = profile.meta.name
                 if (isDefined(name)) {
                     Surface.get(labelName).requestFloatingTextInput(event, name)
                         .then(name => profile.updateMetaData("name", name))
                 }
             }}/>
    )
    const profileLifecycle = lifecycle.own(new Terminator())
    lifecycle.own(service.profileService.catchupAndSubscribe(owner => {
        profileLifecycle.terminate()
        const optProfile = owner.getValue()
        if (optProfile.nonEmpty()) {
            const profile = optProfile.unwrap()
            const observer = (meta: ProjectMeta) => labelName.textContent = meta.name
            profileLifecycle.own(profile.subscribeMetaData(observer))
            observer(profile.meta)
        } else {
            labelName.textContent = "⏏︎"
        }
    }))
    const lastBuildTime = TimeSpan.millis(new Date(service.buildInfo.date).getTime() - new Date().getTime()).toUnitString()
    const labelLatency: HTMLElement = (<div title="Latency">N/A</div>)
    lifecycle.own(Runtime.scheduleInterval(() => {
        const outputLatency = service.audioContext.outputLatency
        if (outputLatency > 0.0) {
            labelLatency.textContent = `${(outputLatency * 1000.0).toFixed(1)}ms`
        }
    }, 1000))
    const footer: HTMLElement = (
        <footer className={className}>
            {labelOnline}
            {labelName}
            <div title="SampleRate">{service.audioContext.sampleRate}</div>
            {labelLatency}
            <div title="Build Version">{service.buildInfo.uuid}</div>
            <div title="Build Time">{lastBuildTime}</div>
            <div style={{flex: "1"}}/>
            <div style={{color: Colors.cream}}>
                <LocalLink href="/privacy">Privacy</LocalLink> · <LocalLink href="/imprint">Imprint</LocalLink>
            </div>
        </footer>
    )
    service.registerFooter((): FooterLabel => {
        const label: HTMLElement = <div/>
        footer.appendChild(label)
        return {
            setTitle: (value: string) => label.title = value,
            setValue: (value: string) => label.textContent = value,
            terminate: () => {if (label.isConnected) {label.remove()}}
        } satisfies FooterLabel
    })
    return footer
}