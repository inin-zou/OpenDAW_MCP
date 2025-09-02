import type {CloudStorageHandler} from "./CloudAuthManager"
import {Dropbox, DropboxResponse, files} from "dropbox"
import {isDefined, Option, panic} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"

export class DropboxHandler implements CloudStorageHandler {
    readonly #accessToken: string
    readonly #basePath: string

    #dropboxClient: Option<Dropbox> = Option.None

    constructor(token: string, basePath: string) {
        this.#accessToken = token
        this.#basePath = basePath
    }

    async upload(path: string, buffer: ArrayBuffer): Promise<void> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)
        console.debug("[Dropbox] Uploading to:", fullPath)
        const {status, error, value: result} = await Promises.tryCatch(client
            .filesUpload({path: fullPath, contents: buffer, mode: {".tag": "overwrite"}}))
        if (status === "rejected") {
            return panic(error)
        } else {
            console.debug("[Dropbox] Upload successful:", result.result.path_display)
        }
    }

    async download(path: string): Promise<ArrayBuffer> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)
        const response = await client.filesDownload({path: fullPath})
        const {result: {fileBlob}} = response as DropboxResponse<files.FileMetadata & { fileBlob: Blob }>
        return fileBlob.arrayBuffer()
    }

    async list(path?: string): Promise<string[]> {
        const client = await this.#ensureClient()
        const fullPath = path ? this.#getFullPath(path) : this.#basePath
        const response = await client.filesListFolder({path: fullPath})
        return response.result.entries.map(entry => entry.name).filter(isDefined)
    }

    async delete(path: string): Promise<void> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)
        await client.filesDeleteV2({path: fullPath})
    }

    async #ensureClient(): Promise<Dropbox> {
        if (this.#dropboxClient.isEmpty()) {
            const DropboxModule = await import("dropbox")
            this.#dropboxClient = Option.wrap(new DropboxModule.Dropbox({accessToken: this.#accessToken}))
            const {status, error} = await Promises.tryCatch(
                this.#dropboxClient.unwrap().filesCreateFolderV2({path: this.#basePath}))
                .catch(error => (error as any))
            if (status === "rejected") {
                if (error?.error?.error_summary?.includes("path/conflict/folder")) {
                    console.debug("[Dropbox] path exists (error above is expected)")
                } else {
                    return panic(error)
                }
            }
        }
        return this.#dropboxClient.unwrap()
    }

    #getFullPath(path: string): string {
        if (path.includes(":") || path.includes("T")) {
            const filename = path.replace(/:/g, "-")
            return `${this.#basePath}/${filename}`
        }
        const cleanPath = path.startsWith("/") ? path : `/${path}`
        return `${this.#basePath}${cleanPath}`
    }
}