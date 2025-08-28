import css from "./ErrorsPage.sass?inline"
import {Await, createElement, Group, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {EmptyExec, Strings, TimeSpan} from "@opendaw/lib-std"
import {Dialogs} from "@/ui/components/dialogs.tsx"
import {LogBuffer} from "@/errors/LogBuffer.ts"
import {Logs} from "@/ui/pages/errors/Logs.tsx"
import {Stack} from "@/ui/pages/errors/Stack.tsx"

const className = Html.adoptStyleSheet(css, "ErrorsPage")

type Entry = {
    id: string
    date: string
    user_agent: string
    build_uuid: string
    build_env: string
    build_date: string
    script_tags: string
    error_name: string
    error_message: string
    error_stack: string
    logs: string
    fixed: number
}

export const ErrorsPage: PageFactory<StudioService> = ({}: PageContext<StudioService>) => {
    return (
        <div className={className}>
            <h1>Errors</h1>
            <p>This page shows all errors reported from users running openDAW in production, helping us identify and fix
                issues.</p>
            <Await factory={() => fetch(`https://logs.opendaw.studio/list.php`).then(x => x.json())}
                   failure={(error) => `Unknown request (${error.reason})`}
                   loading={() => <p>loading...</p>}
                   success={(json: ReadonlyArray<Entry>) => (
                       <div className="list">
                           <Group>
                               <h4>#</h4>
                               <h4>Time</h4>
                               <h4>Build</h4>
                               <h4>Type</h4>
                               <h4>Message</h4>
                               <h4>JS</h4>
                               <h4>Browser</h4>
                               <h4>Stack</h4>
                               <h4>Logs</h4>
                               <h4>Fixed</h4>
                           </Group>
                           {json.map((entry: Entry) => {
                                   const nowTime = new Date().getTime()
                                   const errorTime = new Date(entry.date).getTime()
                                   const errorTimeString = TimeSpan.millis(errorTime - nowTime).toUnitString()
                                   const buildTimeString = TimeSpan.millis(new Date(entry.build_date).getTime() - nowTime).toUnitString()
                                   const userAgent = entry.user_agent.replace(/^Mozilla\/[\d.]+\s*/, "")
                                   const errorMessage = Strings.fallback(entry.error_message, "No message")
                                   return (
                                       <div className={Html.buildClassList("row", entry.fixed === 1 && "fixed")}>
                                           <div>{entry.id}</div>
                                           <div>{errorTimeString}</div>
                                           <div>{buildTimeString}</div>
                                           <div>{entry.error_name}</div>
                                           <div className="error-message" title={errorMessage}>{errorMessage}</div>
                                           <div>{entry.script_tags}</div>
                                           <div className="browser" title={userAgent}>{userAgent}</div>
                                           <div style={{cursor: "pointer"}}
                                                onclick={() => Dialogs.show({
                                                    headline: "Error Stack",
                                                    content: (<Stack stack={entry.error_stack}/>)
                                                }).catch(EmptyExec)}>
                                               📂
                                           </div>
                                           <div style={{cursor: "pointer"}}
                                                onclick={() => {
                                                    const entries = JSON.parse(entry.logs) as Array<LogBuffer.Entry>
                                                    return Dialogs.show({
                                                        headline: "Logs",
                                                        content: (
                                                            <Logs errorTime={errorTime}
                                                                  entries={entries.reverse()}/>
                                                        )
                                                    }).catch(EmptyExec)
                                                }}>
                                               📂
                                           </div>
                                           <div>{entry.fixed ? "Yes 👍" : "No 🙄"}</div>
                                       </div>
                                   )
                               }
                           )}
                       </div>
                   )}/>
        </div>
    )
}