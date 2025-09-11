import {asDefined, Errors, isDefined, isUndefined, Maps, panic, RuntimeNotifier, TimeSpan} from "@opendaw/lib-std"
import {CloudStorageHandler} from "./CloudStorageHandler"
import {Promises} from "@opendaw/lib-runtime"
import {Service} from "./Service"

// TODO Tokens expire after 1 hour. When receiving a 401/403, we need to re-auth.

export class CloudAuthManager {
    static create(): CloudAuthManager {return new CloudAuthManager()}

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

    readonly id = CloudAuthManager.#ID++

    readonly #memoizedHandlers = new Map<Service, () => Promise<CloudStorageHandler>>()

    private constructor() {}

    async getHandler(service: Service): Promise<CloudStorageHandler> {
        const memo = Maps.createIfAbsent(this.#memoizedHandlers, service, service => {
            switch (service) {
                case "Dropbox": {
                    return Promises.memoizeAsync(this.#oauthDropbox.bind(this), TimeSpan.hours(1))
                }
                case "GoogleDrive": {
                    return Promises.memoizeAsync(this.#oauthGoogle.bind(this), TimeSpan.hours(1))
                }
                case "SFTP": {
                    return Promises.memoizeAsync(this.#sftp.bind(this), TimeSpan.hours(1))
                }
                default:
                    return panic(`Unsupported service: ${service}`)
            }
        })
        return memo()
    }

    async #oauthPkceFlow(config: {
        service: string
        clientId: string
        authUrlBase: string
        tokenUrl: string
        scope: string
        extraAuthParams?: Record<string, string>
        extraTokenParams?: Record<string, string>
    }): Promise<CloudStorageHandler> {
        const redirectUri = `${location.origin}/auth-callback.html`
        const {codeVerifier, codeChallenge} = await CloudAuthManager.#createCodes()
        const params = new URLSearchParams({
            client_id: config.clientId,
            response_type: "code",
            redirect_uri: redirectUri,
            scope: config.scope,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            ...(config.extraAuthParams ?? {})
        })
        const authUrl = `${config.authUrlBase}?${params.toString()}`
        console.debug("[CloudAuth] Opening auth window:", authUrl)
        const authWindow = window.open(authUrl, "cloudAuth")
        if (isUndefined(authWindow)) {
            return Errors.warn("Failed to open authentication window. Please check popup blockers.")
        }
        const {resolve, reject, promise} = Promise.withResolvers<CloudStorageHandler>()
        const channel = new BroadcastChannel("auth-callback")
        const dialog = RuntimeNotifier.progress({
            headline: "Cloud Service",
            message: "Please wait for authentication...",
            cancel: () => reject("cancelled")
        })
        channel.onmessage = async (event: MessageEvent<any>) => {
            const data = asDefined(event.data, "No data")
            console.debug("[CloudAuth] Received via BroadcastChannel:", this.id, data)
            if (data.type === "auth-callback" && isDefined(data.code)) {
                console.debug("[CloudAuth] Processing code from BroadcastChannel...", data.type, data.code)
                try {
                    const tokenParams = new URLSearchParams({
                        code: data.code,
                        grant_type: "authorization_code",
                        client_id: config.clientId,
                        redirect_uri: redirectUri,
                        code_verifier: codeVerifier,
                        ...(config.extraTokenParams ?? {})
                    })
                    const response = await fetch(config.tokenUrl, {
                        method: "POST",
                        headers: {"Content-Type": "application/x-www-form-urlencoded"},
                        body: tokenParams.toString()
                    })
                    if (!response.ok) {
                        const errorText = await response.text()
                        console.error("[CloudAuth] Token exchange error:", errorText)
                        return panic(`Token exchange failed: ${response.statusText}`)
                    }
                    const dataJson = await response.json()
                    const accessToken = dataJson.access_token
                    if (!accessToken) {
                        return panic("No access_token in token response")
                    }
                    resolve(await this.#createHandler(config.service, accessToken))
                } catch (err) {
                    console.debug("[CloudAuth] Token exchange failed:", err)
                    reject(err)
                }
            } else if (data.type === "closed") {
                console.debug("[CloudAuth] Callback window closed")
                reject(null)
            }
        }
        return promise.finally(() => {
            console.debug("[CloudAuth] Closing auth window")
            authWindow.close()
            dialog.terminate()
            channel.close()
        })
    }

    async #oauthDropbox(): Promise<CloudStorageHandler> {
        return this.#oauthPkceFlow({
            service: "dropbox",
            clientId: "jtehjzxaxf3bf1l",
            authUrlBase: "https://www.dropbox.com/oauth2/authorize",
            tokenUrl: "https://api.dropboxapi.com/oauth2/token",
            scope: "", // Dropbox scope is optional
            extraAuthParams: {
                token_access_type: "offline"
            }
        })
    }

    async #oauthGoogle(): Promise<CloudStorageHandler> {
        const clientId = "628747153367-gt1oqcn3trr9l9a7jhigja6l1t3f1oik.apps.googleusercontent.com"
        const scope = "https://www.googleapis.com/auth/drive.appdata"

        const redirectUri = `${location.origin}/auth-callback.html`
        const params = new URLSearchParams({
            client_id: clientId,
            response_type: "token",
            redirect_uri: redirectUri,
            scope,
            include_granted_scopes: "true",
            prompt: "consent"
        })
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
        console.debug("[CloudAuth] Opening auth window:", authUrl)

        const authWindow = window.open(authUrl, "cloudAuth")
        if (isUndefined(authWindow)) {
            return Errors.warn("Failed to open authentication window. Please check popup blockers.")
        }

        const {resolve, reject, promise} = Promise.withResolvers<CloudStorageHandler>()
        const channel = new BroadcastChannel("auth-callback")
        const dialog = RuntimeNotifier.progress({
            headline: "Google Drive",
            message: "Please authorize access to app data...",
            cancel: () => reject("cancelled")
        })

        channel.onmessage = async (event: MessageEvent<any>) => {
            const data = asDefined(event.data, "No data")
            console.debug("[CloudAuth] Received via BroadcastChannel:", this.id, data)
            if (data.type === "auth-callback" && isDefined(data.access_token)) {
                try {
                    const accessToken = data.access_token
                    resolve(await this.#createHandler("google", accessToken))
                } catch (err) {
                    reject(err)
                }
            } else if (data.type === "closed") {
                console.debug("[CloudAuth] Callback window closed")
                reject(null)
            }
        }

        return promise.finally(() => {
            console.debug("[CloudAuth] Closing auth window")
            authWindow.close()
            dialog.terminate()
            channel.close()
        })
    }

    async #sftp(): Promise<CloudStorageHandler> {
        // This is a credentials-based flow (no OAuth). Here you would:
        // 1) Prompt the user for host, port, username, password / key.
        // 2) Instantiate the SFTP handler with those credentials.
        // For now, return a warning or wire up a dialog.
        return Errors.warn("SFTP authentication flow not implemented yet. Please provide connection settings UI.")
        // Example when implemented:
        // const {SFTPHandler} = await import("./SFTPHandler")
        // return new SFTPHandler({host, port, username, passwordOrKey})
    }

    async #createHandler(service: string, token: string): Promise<CloudStorageHandler> {
        switch (service) {
            case "dropbox": {
                const {DropboxHandler} = await import("./DropboxHandler")
                return new DropboxHandler(token)
            }
            case "google": {
                const {GoogleDriveHandler} = await import("./GoogleDriveHandler")
                return new GoogleDriveHandler(token)
            }
            default:
                return panic(`Handler not implemented for service: ${service}`)
        }
    }
}