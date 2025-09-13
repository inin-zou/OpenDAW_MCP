import css from "./ProjectBrowser.sass?inline"
import {StudioService} from "@/service/StudioService"
import {Lifecycle, Procedure, RuntimeSignal, StringComparator, TimeSpan, UUID} from "@opendaw/lib-std"
import {Icon} from "@/ui/components/Icon"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Dialogs} from "@/ui/components/dialogs"
import {Await, createElement, DomElement, Frag, Group} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {ProjectMeta, ProjectSignals, ProjectStorage} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "ProjectBrowser")

type Construct = {
    service: StudioService
    lifecycle: Lifecycle
    select: Procedure<[UUID.Bytes, ProjectMeta]>
}

export const ProjectBrowser = ({service, lifecycle, select}: Construct) => {
    const now = new Date().getTime()
    return (
        <div className={className}>
            <Await factory={() => ProjectStorage.listProjects()}
                   loading={() => <span>loading...</span>}
                   failure={({reason}) => (
                       <span>{reason instanceof DOMException ? reason.name : String(reason)}</span>
                   )}
                   repeat={exec => lifecycle.own(RuntimeSignal
                       .subscribe(signal => signal === ProjectSignals.StorageUpdated && exec()))}
                   success={projects => (
                       <Frag>
                           <header>
                               <div className="name">Name</div>
                               <div className="time">Modified</div>
                               <div/>
                           </header>
                           <div className="list">
                               {projects
                                   .toSorted((a, b) => -StringComparator(a.meta.modified, b.meta.modified))
                                   .map(({uuid, meta}) => {
                                       const icon: DomElement = <Icon symbol={IconSymbol.Delete}
                                                                      className="delete-icon"/>
                                       const timeString = TimeSpan.millis(new Date(meta.modified).getTime() - now).toUnitString()
                                       const row: HTMLElement = (
                                           <Group>
                                               <div className="labels" onclick={() => select([uuid, meta])}>
                                                   <div className="name">{meta.name}</div>
                                                   <div className="time">{timeString}</div>
                                               </div>
                                               {icon}
                                           </Group>
                                       )
                                       icon.onclick = (event) => {
                                           event.stopPropagation()
                                           Dialogs.approve({
                                               headline: "Delete Project?",
                                               message: "Are you sure? This cannot be undone."
                                           }).then(approved => {
                                               if (approved) {
                                                   service.deleteProject(uuid, meta).then(() => row.remove())
                                               }
                                           })
                                       }
                                       return row
                                   })}
                           </div>
                       </Frag>
                   )}/>
        </div>
    )
}