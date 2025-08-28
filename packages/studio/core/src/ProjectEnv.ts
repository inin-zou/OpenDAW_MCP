import {SampleManager} from "@opendaw/studio-adapters"

export interface ProjectEnv {
    dialogs?: ProjectEnv.Dialogs
    sampleManager: SampleManager
}

export namespace ProjectEnv {
    export interface Dialogs {
        info(headline: string, message: string, okText: string): Promise<void>
        approve(headline: string, message: string, approveText: string, cancelText: string): Promise<boolean>
    }
}