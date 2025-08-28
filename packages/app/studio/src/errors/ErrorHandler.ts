import {Abort, EmptyExec, Terminable, Terminator, Warning} from "@opendaw/lib-std"
import {AnimationFrame, Browser, Events} from "@opendaw/lib-dom"
import {LogBuffer} from "@/errors/LogBuffer.ts"
import {ErrorLog} from "@/errors/ErrorLog.ts"
import {ErrorInfo} from "@/errors/ErrorInfo.ts"
import {Surface} from "@/ui/surface/Surface.tsx"
import {StudioService} from "@/service/StudioService.ts"
import {Dialogs} from "@/ui/components/dialogs.tsx"

export class ErrorHandler {
    readonly terminator = new Terminator()
    readonly #service: StudioService

    #errorThrown: boolean = false

    constructor(service: StudioService) {this.#service = service}

    processError(scope: string, event: Event): boolean {
        if ("reason" in event) {
            const reason = event.reason
            if (reason instanceof Abort) {
                console.debug(`Abort '${reason.message}'`)
                event.preventDefault()
                return false
            }
            if (reason instanceof Warning) {
                console.debug(`Warning '${reason.message}'`)
                event.preventDefault()
                Dialogs.info({headline: "Warning", message: reason.message}).then(EmptyExec)
                return false
            }
        }
        console.debug("processError", scope, event)
        if (this.#errorThrown) {return false}
        this.#errorThrown = true
        AnimationFrame.terminate()
        const error = ErrorInfo.extract(event)
        console.debug("ErrorInfo", error.name, error.message)
        const body = JSON.stringify({
            date: new Date().toISOString(),
            agent: Browser.userAgent,
            build: this.#service.buildInfo,
            scripts: document.scripts.length,
            error,
            logs: LogBuffer.get()
        } satisfies ErrorLog)
        if (import.meta.env.PROD) {
            fetch("https://logs.opendaw.studio/log.php", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body
            }).then(console.info, console.warn)
        }
        console.error(scope, error.name, error.message, error.stack)
        const probablyHasExtension = document.scripts.length > 1
            || error.message?.includes("script-src blocked eval") === true
            || error.stack?.includes("chrome-extension://") === true
        if (Surface.isAvailable()) {
            Dialogs.error({
                scope: scope,
                name: error.name,
                message: error.message ?? "no message",
                probablyHasExtension,
                backupCommand: this.#service.recovery.createBackupCommand()
            })
        } else {
            alert(`Boot Error in '${scope}': ${error.name}`)
        }
        return true
    }

    install(owner: WindowProxy | Worker | AudioWorkletNode, scope: string): Terminable {
        if (this.#errorThrown) {return Terminable.Empty}
        const lifetime = this.terminator.own(new Terminator())
        lifetime.ownAll(
            Events.subscribe(owner, "error", event => {
                if (this.processError(scope, event)) {lifetime.terminate()}
            }),
            Events.subscribe(owner, "unhandledrejection", event => {
                if (this.processError(scope, event)) {lifetime.terminate()}
            }),
            Events.subscribe(owner, "messageerror", event => {
                if (this.processError(scope, event)) {lifetime.terminate()}
            }),
            Events.subscribe(owner, "processorerror" as any, event => {
                if (this.processError(scope, event)) {lifetime.terminate()}
            }),
            Events.subscribe(owner, "securitypolicyviolation", (event: SecurityPolicyViolationEvent) => {
                if (this.processError(scope, event)) {lifetime.terminate()}
            })
        )
        return lifetime
    }
}