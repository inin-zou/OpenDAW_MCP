// CloudAuthManager.ts

export interface CloudStorageHandler {
    upload(path: string, data: ArrayBuffer | Blob): Promise<void>;
    download(path: string): Promise<ArrayBuffer>;
    list(path?: string): Promise<string[]>;
    delete(path: string): Promise<void>;
}

export class CloudAuthManager {
    #authWindow: Window | null = null
    #clientId: string
    #redirectUri: string
    #codeVerifier: string = ""
    #codeChallenge: string = ""

    constructor(config: { clientId: string; redirectUri?: string }) {
        this.#clientId = config.clientId
        // Default to current origin + /auth-callback path
        this.#redirectUri = config.redirectUri || `${window.location.origin}/auth-callback`
    }

    // Generate PKCE challenge
    async #generatePKCE() {
        // Generate random code verifier
        const array = new Uint8Array(32)
        crypto.getRandomValues(array)
        this.#codeVerifier = btoa(String.fromCharCode(...array))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "")

        // Generate code challenge (SHA256 of verifier)
        const encoder = new TextEncoder()
        const data = encoder.encode(this.#codeVerifier)
        const digest = await crypto.subtle.digest("SHA-256", data)
        this.#codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "")
    }

    /**
     * Opens an authentication window for the specified cloud service
     * @param service - The cloud service to authenticate with
     * @returns A promise that resolves with a handler for the cloud storage
     */
    async authenticate(service: "dropbox" | "googledrive" | "onedrive"): Promise<CloudStorageHandler> {
        // Generate PKCE challenge before opening window
        await this.#generatePKCE()

        return new Promise((resolve, reject) => {
            const authUrl = this.#getAuthUrl(service)

            console.log("[CloudAuth] Opening auth window:", authUrl)

            // Open popup window for authentication
            this.#authWindow = window.open(
                authUrl,
                "cloudAuth",
                "width=600,height=700,left=200,top=100"
            )

            if (!this.#authWindow) {
                reject(new Error("Failed to open authentication window. Please check popup blockers."))
                return
            }

            let checkClosed = false

            // Listen for messages from the callback page
            const messageHandler = async (event: MessageEvent) => {
                console.log("[CloudAuth] Received message:", event.data, "from:", event.origin)

                // Verify origin matches our redirect URI
                if (event.origin !== new URL(this.#redirectUri).origin) {
                    console.log("[CloudAuth] Origin mismatch. Expected:", new URL(this.#redirectUri).origin)
                    return
                }

                if (event.data?.type === "auth-callback" && event.data?.code) {
                    console.log("[CloudAuth] Got auth code, exchanging for token...")
                    window.removeEventListener("message", messageHandler)
                    checkClosed = true
                    this.#authWindow?.close()

                    try {
                        // Exchange code for token
                        const token = await this.#exchangeCodeForToken(service, event.data.code)
                        console.log("[CloudAuth] Token received successfully")
                        const handler = await this.#createHandler(service, token)
                        resolve(handler)
                    } catch (err) {
                        console.error("[CloudAuth] Token exchange failed:", err)
                        reject(err)
                    }
                }
            }

            window.addEventListener("message", messageHandler)
            console.log("[CloudAuth] Message listener registered")

            // Also listen via BroadcastChannel as fallback
            let channel: BroadcastChannel | null = null
            try {
                channel = new BroadcastChannel("auth-callback")
                channel.onmessage = async (event) => {
                    console.log("[CloudAuth] Received via BroadcastChannel:", event.data)
                    if (event.data?.type === "auth-callback" && event.data?.code) {
                        console.log("[CloudAuth] Processing code from BroadcastChannel...")
                        window.removeEventListener("message", messageHandler)
                        channel?.close()
                        checkClosed = true
                        this.#authWindow?.close()

                        try {
                            const token = await this.#exchangeCodeForToken(service, event.data.code)
                            console.log("[CloudAuth] Token received successfully via broadcast")
                            const handler = await this.#createHandler(service, token)
                            resolve(handler)
                        } catch (err) {
                            console.error("[CloudAuth] Token exchange failed:", err)
                            reject(err)
                        }
                    }
                }
                console.log("[CloudAuth] BroadcastChannel listener registered")
            } catch (err) {
                console.log("[CloudAuth] BroadcastChannel not supported:", err)
            }

            // Check if window was closed without completing auth
            const checkWindowClosed = () => {
                if (checkClosed) return

                try {
                    // Try to access a property - this will throw if window is truly closed
                    // Don't check .closed property as it can be unreliable
                    // @ts-ignore
                    const test = this.#authWindow?.location
                    // If we get here, window is still open (even if cross-origin)
                    setTimeout(checkWindowClosed, 500)
                } catch (err) {
                    // Window is either closed OR we can't access it due to cross-origin
                    // Try to check if it's really closed by checking for specific error
                    try {
                        // This should work even for cross-origin
                        if (this.#authWindow && !this.#authWindow.window) {
                            // Window is truly closed
                            console.log("[CloudAuth] Auth window was closed")
                            window.removeEventListener("message", messageHandler)
                            channel?.close()
                            reject(new Error("Authentication cancelled by user"))
                            return
                        }
                    } catch (e) {
                        // Can't determine state, keep waiting
                    }
                    setTimeout(checkWindowClosed, 500)
                }
            }

            // Give the window time to fully open before checking
            setTimeout(checkWindowClosed, 1000)

            // Timeout after 5 minutes
            setTimeout(() => {
                if (!checkClosed) {
                    console.log("[CloudAuth] Authentication timeout")
                    window.removeEventListener("message", messageHandler)
                    this.#authWindow?.close()
                    reject(new Error("Authentication timeout"))
                }
            }, 5 * 60 * 1000)
        })
    }

    #getAuthUrl(service: string): string {
        switch (service) {
            case "dropbox":
                // Dropbox OAuth2 URL with PKCE
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

        // Exchange authorization code for access token with PKCE
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
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
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
                // Dynamically import the Dropbox handler
                const {DropboxHandler} = await import("./DropboxHandler")
                return new DropboxHandler(token, "/openDAW")
            default:
                throw new Error(`Handler not implemented for service: ${service}`)
        }
    }
}