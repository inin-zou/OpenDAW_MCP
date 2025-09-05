import {createElement, JsxValue} from "@opendaw/lib-jsx"
import {Button, Dialog, DialogHandler} from "@/ui/components/Dialog.tsx"
import {
    Arrays,
    Errors,
    Exec,
    isDefined,
    ObservableValue,
    Option,
    Procedure,
    Provider,
    Terminable,
    Terminator,
    unitValue
} from "@opendaw/lib-std"
import {Surface} from "@/ui/surface/Surface.tsx"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Box, BoxGraph} from "@opendaw/lib-box"
import {BoxDebugView} from "./BoxDebugView"
import {BoxesDebugView} from "@/ui/components/BoxesDebugView.tsx"
import {ProgressBar} from "@/ui/components/ProgressBar.tsx"
import EmailBody from "@/ErrorMail.txt?raw"
import {Colors} from "@opendaw/studio-core"

export namespace Dialogs {
    type Default = {
        headline?: string,
        content: JsxValue,
        okText?: string,
        buttons?: ReadonlyArray<Button>
        origin?: Element
        abortSignal?: AbortSignal
    }

    type Info = {
        headline?: string,
        message: string,
        okText?: string,
        buttons?: ReadonlyArray<Button>
        origin?: Element
        abortSignal?: AbortSignal
    }

    export const show = async ({headline, content, okText, buttons, origin, abortSignal}: Default): Promise<void> => {
        buttons ??= []
        let resolved = false
        const {resolve, reject, promise} = Promise.withResolvers<void>()
        const dialog: HTMLDialogElement = (
            <Dialog headline={headline ?? "Dialog"}
                    icon={IconSymbol.System}
                    cancelable={true}
                    buttons={[...buttons, {
                        text: okText ?? "Ok",
                        primary: true,
                        onClick: handler => {
                            resolved = true
                            handler.close()
                            resolve()
                        }
                    }]}>
                <div style={{padding: "1em 0"}}>{content}</div>
            </Dialog>
        )
        console.debug("abortSignal", abortSignal)
        Surface.get(origin).body.appendChild(dialog)
        dialog.showModal()
        dialog.addEventListener("close", () => {if (!resolved) {reject(Errors.AbortError)}}, {once: true})
        abortSignal?.addEventListener("abort", () => {
            if (!resolved) {
                resolved = true
                dialog.close()
                reject(abortSignal?.reason ?? Errors.AbortError)
            }
        }, {once: true})
        return promise
    }
    export const info = async ({headline, message, okText, buttons, origin, abortSignal}: Info): Promise<void> =>
        show({headline, content: (<p>{message}</p>), okText, buttons, origin, abortSignal})

    export type ApproveCreation = {
        headline?: string
        approveText?: string
        cancelText?: string
        reverse?: boolean
        message: string
        origin?: Element
    }

    // Never rejects
    export const approve =
        ({headline, message, approveText, cancelText, reverse, origin}: ApproveCreation): Promise<boolean> => {
            reverse ??= false
            const {resolve, promise} = Promise.withResolvers<boolean>()
            const buttons: Array<Button> = [{
                text: approveText ?? "Yes",
                primary: reverse,
                onClick: handler => {
                    handler.close()
                    resolve(true)
                }
            }, {
                text: cancelText ?? "Cancel",
                primary: !reverse,
                onClick: handler => {
                    handler.close()
                    resolve(false)
                }
            }]
            if (reverse) {buttons.reverse()}
            const dialog: HTMLDialogElement = (
                <Dialog headline={headline ?? "Approve"}
                        icon={IconSymbol.System}
                        cancelable={true}
                        buttons={buttons}>
                    <div style={{padding: "1em 0"}}>
                        <p>{message}</p>
                    </div>
                </Dialog>
            )
            Surface.get(origin).body.appendChild(dialog)
            dialog.showModal()
            return promise
        }

    export const progress = ({headline, progress, cancel, origin}: {
        headline: string,
        progress?: ObservableValue<unitValue>,
        cancel?: Exec,
        origin?: Element
    }): Terminator => {
        const lifecycle = new Terminator()
        const buttons: ReadonlyArray<Button> = isDefined(cancel)
            ? [{
                text: "Cancel",
                primary: true,
                onClick: handler => {
                    cancel()
                    handler.close()
                }
            }] : Arrays.empty()
        const dialog: HTMLDialogElement = (
            <Dialog headline={headline}
                    icon={IconSymbol.System}
                    cancelable={isDefined(cancel)}
                    buttons={buttons}>
                {progress && (
                    <div style={{padding: "1em 0"}}>
                        <ProgressBar lifecycle={lifecycle} progress={progress}/>
                    </div>
                )}
            </Dialog>
        )
        Surface.get(origin).flyout.appendChild(dialog)
        dialog.addEventListener("close", () => lifecycle.terminate(), {once: true})
        dialog.showModal()
        lifecycle.own(Terminable.create(() => dialog.close()))
        return lifecycle
    }

    export const processMonolog = (headline: string,
                                   content?: HTMLElement,
                                   cancel?: Exec,
                                   origin?: Element): DialogHandler => {
        const lifecycle = new Terminator()
        const buttons: ReadonlyArray<Button> = isDefined(cancel)
            ? [{
                text: "Cancel",
                primary: true,
                onClick: handler => {
                    cancel()
                    handler.close()
                }
            }] : Arrays.empty()
        const dialog: HTMLDialogElement = (
            <Dialog headline={headline}
                    icon={IconSymbol.System}
                    cancelable={true}
                    buttons={buttons}>
                {content}
            </Dialog>
        )
        Surface.get(origin).flyout.appendChild(dialog)
        dialog.addEventListener("close", () => lifecycle.terminate(), {once: true})
        dialog.showModal()
        return {close: () => {dialog.close()}}
    }

    export const debugBoxes = (boxGraph: BoxGraph, origin?: Element): void => {
        const dialog: HTMLDialogElement = (
            <Dialog headline="Debug Box"
                    icon={IconSymbol.System}
                    cancelable={true}
                    style={{minWidth: "24rem", minHeight: "24rem"}}
                    buttons={[{
                        text: "Ok",
                        primary: true,
                        onClick: handler => handler.close()
                    }]}>
                <div style={{padding: "1em 0"}}>
                    <BoxesDebugView boxGraph={boxGraph}/>
                </div>
            </Dialog>
        )
        Surface.get(origin).body.appendChild(dialog)
        dialog.showModal()
    }

    export const debugBox = (box: Box, origin?: Element): void => {
        const dialog: HTMLDialogElement = (
            <Dialog headline="Debug Box"
                    icon={IconSymbol.System}
                    cancelable={true}
                    style={{minWidth: "32rem", minHeight: "32rem"}}
                    buttons={[{
                        text: "Ok",
                        primary: true,
                        onClick: handler => handler.close()
                    }]}>
                <div style={{padding: "1em 0"}}>
                    <BoxDebugView box={box}/>
                </div>
            </Dialog>
        )
        Surface.get(origin).body.appendChild(dialog)
        dialog.showModal()
    }

    export const newItem = (headline: string, suggestion: string, factory: Procedure<string>): void => {
        const input: HTMLInputElement = (
            <input type="text" value={suggestion} autofocus
                   style={{
                       width: "100%",
                       backgroundColor: "rgba(0, 0, 0, 0.2)",
                       outline: "none",
                       border: "none"
                   }}/>
        )
        const dialog: HTMLDialogElement = (
            <Dialog headline={headline}
                    icon={IconSymbol.Add}
                    cancelable={true}
                    buttons={[{
                        text: "Cancel",
                        primary: false,
                        onClick: handler => handler.close()
                    }, {
                        text: "Create",
                        primary: true,
                        onClick: handler => {
                            factory(input.value)
                            handler.close()
                        }
                    }]}>
                <div style={{padding: "1em 0"}}>{input}</div>
            </Dialog>
        )
        input.onfocus = () => input.select()
        input.onkeydown = event => {
            if (event.code === "Enter") {
                factory(input.value)
                dialog.close()
            }
        }
        document.body.appendChild(dialog)
        dialog.showModal()
    }

    export const error = ({name, message, probablyHasExtension, backupCommand = Option.None}: {
        scope: string,
        name: string,
        message: string,
        probablyHasExtension: boolean,
        backupCommand?: Option<Provider<Promise<void>>>
    }): void => {
        console.debug(`Recovery enabled: ${backupCommand}`)
        const dialog: HTMLDialogElement = (
            <Dialog headline="An error occurred :("
                    icon={IconSymbol.Robot}
                    buttons={backupCommand.nonEmpty() ? [{
                        text: "Recover",
                        onClick: () => {
                            const command = backupCommand.unwrap()
                            command().then(() => location.reload())
                        }
                    }, {
                        text: "Dismiss",
                        onClick: () => location.reload()
                    }, {
                        text: "EMail",
                        primary: true,
                        onClick: () => window.location.href =
                            `mailto:support@opendaw.org?subject=${
                                encodeURI("Bug Report - openDAW")}&body=${encodeURI(EmailBody)}`
                    }] : Arrays.empty()}
                    cancelable={false}
                    error>
                <div style={{padding: "1em 0", maxWidth: "50vw"}}>
                    <h3>{name}</h3>
                    <p>{message}</p>
                    {probablyHasExtension && (
                        <p style={{color: Colors.red}}>
                            Something extra is running! A browser extension might be causing issues. Disable
                            extensions for this site.
                        </p>
                    )}
                </div>
            </Dialog>
        )
        document.body.appendChild(dialog)
        dialog.showModal()
    }

    export const cache = (): void => {
        const dialog: HTMLDialogElement = (
            <Dialog headline="An error occurred :("
                    icon={IconSymbol.Robot}
                    buttons={[{
                        text: "Reload",
                        onClick: () => location.reload()
                    }]}
                    cancelable={false}
                    error>
                <div style={{padding: "1em 0", maxWidth: "50vw"}}>
                    <p>Caching Issue detected. A new version is in place. Please reload or clear your browsers
                        cache.</p>
                    {document.scripts.length > 1 &&
                        <p style={{color: Colors.red, fontWeight: "bolder"}}>Browser extensions detected! Please disable
                            before reload!</p>}
                </div>
            </Dialog>
        )
        document.body.appendChild(dialog)
        dialog.showModal()
    }
}