import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {Project} from "../project/Project"
import {AudioData, SampleLoader, SampleLoaderState, SampleManager} from "@opendaw/studio-adapters"
import {InaccessibleProperty, Observer, Option, panic, Subscription, Terminable, UUID} from "@opendaw/lib-std"
import {Xml} from "@opendaw/lib-xml"
import {FileReferenceSchema} from "@opendaw/lib-dawproject"
import {DawProjectExporter} from "./DawProjectExporter"
import {Peaks} from "@opendaw/lib-fusion"

describe("DawProjectExport", () => {
    it("export", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const projectPath = "../../../../../test-files/all-devices.od"
        const buffer = fs.readFileSync(path.join(__dirname, projectPath))
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        const project = Project.load({
            audioContext: InaccessibleProperty as any,
            audioWorklets: InaccessibleProperty as any,
            sampleManager: new class implements SampleManager {
                record(_loader: SampleLoader & { uuid: UUID.Format }): void {
                    throw new Error("Method not implemented.")
                }
                getOrCreate(format: UUID.Format): SampleLoader {
                    return new class implements SampleLoader {
                        data: Option<AudioData> = Option.None
                        peaks: Option<Peaks> = Option.None
                        uuid: UUID.Format = format
                        state: SampleLoaderState = {type: "progress", progress: 0.0}
                        meta: Option<any> = Option.None
                        invalidate(): void {throw new Error("Method not implemented.")}
                        subscribe(_observer: Observer<SampleLoaderState>): Subscription {
                            return Terminable.Empty
                        }
                    }
                }
                remove(_uuid: UUID.Format): void {return panic("Method not implemented.")}
                invalidate(_uuid: UUID.Format): void {return panic("Method not implemented.")}
            }
        }, arrayBuffer)
        const schema = DawProjectExporter.write(project, {
            write: (path: string, buffer: ArrayBufferLike): FileReferenceSchema => {
                console.debug(`store ${buffer.byteLength} bytes at ${path}`)
                return Xml.element({path, external: false}, FileReferenceSchema)
            }
        })
        // console.dir(schema, {depth: Number.MAX_SAFE_INTEGER})
        console.debug(Xml.pretty(Xml.toElement("Project", schema)))
    })
})