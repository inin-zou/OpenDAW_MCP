import {Dropbox, DropboxResponse, DropboxResponseError, files} from "dropbox"
import {isDefined, Option, panic} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {CloudStorageHandler} from "./CloudStorageHandler"
import {FileNotFoundError} from "./FileNotFoundError"

export class DropboxHandler implements CloudStorageHandler {
    readonly #accessToken: string

    #dropboxClient: Option<Dropbox> = Option.None

    constructor(accessToken: string) {this.#accessToken = accessToken}

    async alive(): Promise<void> {
        const client = await this.#ensureClient()
        const {status, error} = await Promises.tryCatch(client.usersGetCurrentAccount())
        if (status === "rejected") return panic(error)
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
        const response = await client.filesDownload({path: fullPath}).catch(error => {
            if (this.#isNotFoundError(error)) {
                console.log(`The error above is expected. The file at '${path}' does not exist.`)
                throw new FileNotFoundError(path)
            }
            return error
        })
        const {result: {fileBlob}} = response as DropboxResponse<files.FileMetadata & { fileBlob: Blob }>
        return fileBlob.arrayBuffer()
    }

    async exists(path: string): Promise<boolean> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)
        const {
            status,
            error
        } = await Promises.tryCatch(client.filesGetMetadata({path: fullPath})).catch(error => (error as any))
        if (status === "resolved") return true
        return this.#isNotFoundError(error) ? false : panic(error)
    }

    async list(path?: string): Promise<Array<string>> {
        const client = await this.#ensureClient()
        const fullPath = path ? this.#getFullPath(path) : ""
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
        }
        return this.#dropboxClient.unwrap()
    }

    #getFullPath(path: string): string {
        if (path.includes(":") || path.includes("T")) {
            const filename = path.replace(/:/g, "-")
            return filename.startsWith("/") ? filename : `/${filename}`
        }
        return path.startsWith("/") ? path : `/${path}`
    }

    #isNotFoundError(error: unknown): boolean {
        if (!(error instanceof DropboxResponseError)) return false
        const e = error.error as any
        return e?.error?.[".tag"] === "path" &&
            e.error?.path?.[".tag"] === "not_found"
    }
}