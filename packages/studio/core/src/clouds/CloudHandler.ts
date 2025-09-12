export interface CloudHandler {
    upload(path: string, data: ArrayBuffer): Promise<void>
    exists(path: string): Promise<boolean>
    download(path: string): Promise<ArrayBuffer>
    list(path?: string): Promise<string[]>
    delete(path: string): Promise<void>
    alive(): Promise<void>
}