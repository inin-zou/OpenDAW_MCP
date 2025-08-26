import JSZip from "jszip"
import {Xml} from "@opendaw/lib-xml"
import {asDefined, isDefined, panic, UUID} from "@opendaw/lib-std"
import {FileReferenceSchema, MetaDataSchema, ProjectSchema} from "@opendaw/lib-dawproject"
import {Project} from "../Project"
import {DawProjectExporter} from "./DawProjectExporter"

export namespace DawProject {
    export type Resource = { uuid: UUID.Format, path: string, name: string, buffer: ArrayBuffer }

    export interface ResourceProvider {
        fromPath(path: string): Resource
        fromUUID(uuid: UUID.Format): Resource
    }

    export const decode = async (buffer: ArrayBuffer | NonSharedBuffer): Promise<{
        metaData: MetaDataSchema,
        project: ProjectSchema,
        resources: ResourceProvider
    }> => {
        const zip = await JSZip.loadAsync(buffer)
        const metaDataXml = await zip.file("metadata.xml")?.async("string")
        const metaData = isDefined(metaDataXml) ? Xml.parse(metaDataXml, MetaDataSchema) : Xml.element({}, MetaDataSchema)
        const projectXml = asDefined(await zip.file("project.xml")?.async("string"), "No project.xml found")
        console.debug(projectXml)
        const project = Xml.parse(projectXml, ProjectSchema)
        const resourceFiles = Object.entries(zip.files).filter(([_, file]) =>
            !file.dir && !file.name.endsWith(".xml"))
        const resources: ReadonlyArray<Resource> =
            await Promise.all(resourceFiles.map(async ([path, file]) => {
                const name = path.substring(path.lastIndexOf("/") + 1)
                const buffer = await file.async("arraybuffer")
                const uuid = await UUID.sha256(new Uint8Array(buffer).buffer)
                return {uuid, path, name, buffer}
            }))
        return {
            metaData, project, resources: {
                fromPath: (path: string): Resource => resources
                    .find(resource => resource.path === path) ?? panic("Resource not found"),
                fromUUID: (uuid: UUID.Format): Resource => resources
                    .find(resource => UUID.equals(resource.uuid, uuid)) ?? panic("Resource not found")
            }
        }
    }

    export const encode = (project: Project, metaData: MetaDataSchema): Promise<ArrayBuffer> => {
        const zip = new JSZip()
        const projectSchema = DawProjectExporter.write(project, {
            write: (path: string, buffer: ArrayBuffer): FileReferenceSchema => {
                zip.file(path, buffer)
                return Xml.element({path, external: false}, FileReferenceSchema)
            }
        })
        const metaDataXml = Xml.pretty(Xml.toElement("MetaData", metaData))
        const projectXml = Xml.pretty(Xml.toElement("Project", projectSchema))
        console.debug("encode")
        console.debug(metaDataXml)
        console.debug(projectXml)
        zip.file("metadata.xml", metaDataXml)
        zip.file("project.xml", projectXml)
        return zip.generateAsync({type: "arraybuffer"})
    }
}