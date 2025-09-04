import {assert, Option} from "@opendaw/lib-std"

export namespace RuntimeNotification {
    export type InfoRequest = {
        headline?: string
        message: string
        okText?: string
        abortSignal?: AbortSignal
    }

    export type ApproveRequest = {
        headline?: string
        message: string
        approveText?: string
        cancelText?: string
        abortSignal?: AbortSignal
    }

    export interface Installer {
        install(notifier: Notifier): void
    }

    export interface Notifier {
        info(request: InfoRequest): Promise<void>
        approve(request: ApproveRequest): Promise<boolean>
    }
}

let notifierOption: Option<RuntimeNotification.Notifier> = Option.None

export const RuntimeNotification: RuntimeNotification.Notifier & RuntimeNotification.Installer = {
    info: (request: RuntimeNotification.InfoRequest): Promise<void> => notifierOption.match({
        none: () => Promise.resolve(),
        some: notifier => notifier.info(request)
    }),
    approve: (request: RuntimeNotification.ApproveRequest): Promise<boolean> => notifierOption.match({
        none: () => Promise.resolve(true),
        some: notifier => notifier.approve(request)
    }),
    install: (notifier: RuntimeNotification.Notifier) => {
        assert(notifierOption.isEmpty(), "RuntimeNotification already installed")
        notifierOption = Option.wrap(notifier)
    }
}