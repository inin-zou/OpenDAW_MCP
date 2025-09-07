import {asDefined, Errors, isDefined, isUndefined, panic, RuntimeNotifier, TimeSpan} from "@opendaw/lib-std"
import {CloudStorageHandler} from "./CloudStorageHandler"
import {Promises} from "@opendaw/lib-runtime"

export class CloudAuthManager {
    static async create(): Promise<CloudAuthManager> {
        const clientId = "jtehjzxaxf3bf1l"
        const redirectUri = "https://localhost:8080/auth-callback.html" // TODO Build this dynamically
        const {codeVerifier, codeChallenge} = await this.#createCodes()
        return new CloudAuthManager(clientId, redirectUri, codeVerifier, codeChallenge)
    }

    static async #createCodes(): Promise<{ codeVerifier: string; codeChallenge: string }> {
        const array = new Uint8Array(32)
        crypto.getRandomValues(array)
        const codeVerifier = btoa(String.fromCharCode(...array))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "")

        const encoder = new TextEncoder()
        const data = encoder.encode(codeVerifier)
        const digest = await crypto.subtle.digest("SHA-256", data)
        const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "")
        return {codeVerifier, codeChallenge}
    }

    static #ID = 0

    readonly #clientId: string
    readonly #redirectUri: string
    readonly #codeVerifier: string
    readonly #codeChallenge: string

    readonly #memoizeHandler = Promises.memoizeAsync(this.#dropbox.bind(this), TimeSpan.hours(1))

    readonly id = CloudAuthManager.#ID++

    private constructor(clientId: string, redirectUri: string, codeVerifier: string, codeChallenge: string) {
        this.#clientId = clientId
        this.#redirectUri = redirectUri
        this.#codeVerifier = codeVerifier
        this.#codeChallenge = codeChallenge
    }

    async dropbox(): Promise<CloudStorageHandler> {
        console.debug("call memoizeHandler")
        return this.#memoizeHandler()
    }

    async #dropbox(): Promise<CloudStorageHandler> {
        const service = "dropbox"
        const authUrl = this.#getAuthUrl(service)
        console.debug("[CloudAuth] Opening auth window:", authUrl)
        const authWindow = window.open(authUrl, "cloudAuth")
        if (isUndefined(authWindow)) {
            return Errors.warn("Failed to open authentication window. Please check popup blockers.")
        }
        const {resolve, reject, promise} = Promise.withResolvers<CloudStorageHandler>()
        const channel = new BroadcastChannel("auth-callback")
        const dialog = RuntimeNotifier.progress({
            headline: "Cloud Authentification",
            message: "Waiting for authentification...",
            cancel: () => reject(null)
        })
        channel.onmessage = async (event: MessageEvent<any>) => {
            const data = asDefined(event.data, "No data")
            console.debug("[CloudAuth] Received via BroadcastChannel:", this.id, data)
            if (data.type === "auth-callback" && isDefined(data.code)) {
                console.debug("[CloudAuth] Processing code from BroadcastChannel...", data.type, data.code)
                try {
                    const token = await this.#exchangeCodeForToken(service, data.code)
                    console.debug("[CloudAuth] Token received successfully via broadcast")
                    resolve(await this.#createHandler(service, token))
                } catch (err) {
                    console.debug("[CloudAuth] Token exchange failed:", err)
                    reject(err)
                }
            } else if (data.type === "closed") {
                console.debug("[CloudAuth] Callback window closed")
                reject(null)
            }
        }
        // the beauty is that you can reject a promise after it has been resolved.
        // so we can be sure that this code will always be executed exactly once.
        // we need that because we lose any access (like listening to closing) to the popup
        // once the dropbox HTML has been loaded.
        return promise.finally(() => {
            console.debug("[CloudAuth] Closing auth window")
            authWindow.close()
            dialog.terminate()
            channel.close()
        })
    }

    #getAuthUrl(service: string): string {
        switch (service) {
            case "dropbox":
                const params = new URLSearchParams({
                    client_id: this.#clientId,
                    response_type: "code",
                    redirect_uri: this.#redirectUri,
                    code_challenge: this.#codeChallenge,
                    code_challenge_method: "S256",
                    token_access_type: "offline"
                })
                return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
            default:
                throw new Error(`Unsupported service: ${service}`)
        }
    }

    async #exchangeCodeForToken(service: string, code: string): Promise<string> {
        if (service !== "dropbox") {
            throw new Error(`Token exchange not implemented for service: ${service}`)
        }
        const tokenUrl = "https://api.dropboxapi.com/oauth2/token"
        const params = new URLSearchParams({
            code: code,
            grant_type: "authorization_code",
            client_id: this.#clientId,
            redirect_uri: this.#redirectUri,
            code_verifier: this.#codeVerifier
        })
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: params.toString()
        })
        if (!response.ok) {
            const errorText = await response.text()
            console.error("[CloudAuth] Token exchange error:", errorText)
            throw new Error(`Token exchange failed: ${response.statusText}`)
        }
        const data = await response.json()
        return data.access_token
    }

    async #createHandler(service: string, token: string): Promise<CloudStorageHandler> {
        switch (service) {
            case "dropbox":
                const {DropboxHandler} = await import("./DropboxHandler")
                return new DropboxHandler(token)
            default:
                return panic(`Handler not implemented for service: ${service}`)
        }
    }
}