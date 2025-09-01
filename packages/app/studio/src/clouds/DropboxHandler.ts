// DropboxHandler.ts
import type {CloudStorageHandler} from "./CloudAuthManager"
import {Dropbox, DropboxResponse, files} from "dropbox"

export class DropboxHandler implements CloudStorageHandler {
    #token: string
    #basePath: string
    #dropboxClient?: Dropbox

    constructor(token: string, basePath: string = "/openDAW") {
        this.#token = token
        this.#basePath = basePath
    }

    async #ensureClient(): Promise<Dropbox> {
        if (!this.#dropboxClient) {
            // Dynamic import of Dropbox SDK
            const DropboxModule = await import("dropbox")
            this.#dropboxClient = new DropboxModule.Dropbox({accessToken: this.#token})

            // Ensure base folder exists
            try {
                await this.#dropboxClient.filesCreateFolderV2({path: this.#basePath})
            } catch (error: any) {
                console.warn("filesCreateFolderV2", error)
                // Ignore if folder already exists
                if (error?.error?.error_summary?.includes("path/conflict/folder")) {
                    // Folder already exists, that's fine
                } else {
                    throw error
                }
            }
        }
        return this.#dropboxClient
    }

    #getFullPath(path: string): string {
        if (path.includes(":") || path.includes("T")) {
            const filename = path.replace(/:/g, "-")
            return `${this.#basePath}/${filename}`
        }
        const cleanPath = path.startsWith("/") ? path : `/${path}`
        return `${this.#basePath}${cleanPath}`
    }

    async upload(path: string, data: ArrayBuffer | Blob): Promise<void> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)

        console.log("[Dropbox] Uploading to:", fullPath)

        // Convert Blob to ArrayBuffer if needed
        const buffer = data instanceof Blob
            ? await data.arrayBuffer()
            : data

        try {
            const result = await client.filesUpload({
                path: fullPath,
                contents: buffer,
                mode: {".tag": "overwrite"}
            })
            console.log("[Dropbox] Upload successful:", result.result.path_display)
        } catch (error) {
            console.error("[Dropbox] Upload failed:", error)
            throw error
        }
    }

    async download(path: string): Promise<ArrayBuffer> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)
        const response = await client.filesDownload({path: fullPath})
        const {result: {name, fileBlob}} = response as DropboxResponse<files.FileMetadata & {
            fileBlob: Blob
        }>
        console.debug(`downloaded ${name}`)
        return await fileBlob.arrayBuffer()
    }

    async list(path?: string): Promise<string[]> {
        const client = await this.#ensureClient()
        const fullPath = path ? this.#getFullPath(path) : this.#basePath

        const response = await client.filesListFolder({path: fullPath})

        return response.result.entries
            .map(entry => entry.name)
            .filter(name => name !== undefined)
    }

    async delete(path: string): Promise<void> {
        const client = await this.#ensureClient()
        const fullPath = this.#getFullPath(path)

        await client.filesDeleteV2({path: fullPath})
    }
}