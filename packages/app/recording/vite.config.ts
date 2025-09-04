import {defineConfig} from "vite"
import crossOriginIsolation from "vite-plugin-cross-origin-isolation"
import {readFileSync} from "fs"
import {resolve} from "path"

export default defineConfig(({command}) => ({
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src")
        }
    },
    server: {
        port: 8080,
        host: "localhost",
        https: command === "serve" ? {
            key: readFileSync("../localhost-key.pem"),
            cert: readFileSync("../localhost.pem")
        } : undefined,
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp"
        },
        fs: {
            // Allow serving files from the entire workspace
            allow: [".."]
        }
    },
    plugins: [
        crossOriginIsolation()
    ]
}))