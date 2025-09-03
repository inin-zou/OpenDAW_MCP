import {UUID} from "@opendaw/lib-std"

export namespace ProjectPaths {
    export const Folder = "projects/v1"
    export const ProjectFile = "project.od"
    export const ProjectMetaFile = "meta.json"
    export const ProjectCoverFile = "image.bin"
    export const projectFile = (uuid: UUID.Format): string => `${(projectFolder(uuid))}/${ProjectFile}`
    export const projectMeta = (uuid: UUID.Format): string => `${(projectFolder(uuid))}/${ProjectMetaFile}`
    export const projectCover = (uuid: UUID.Format): string => `${(projectFolder(uuid))}/${ProjectCoverFile}`
    export const projectFolder = (uuid: UUID.Format): string => `${Folder}/${UUID.toString(uuid)}`
}

// TODO Move all over to SDK