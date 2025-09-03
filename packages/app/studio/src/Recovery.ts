import {Option, Provider, UUID} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Project, WorkerAgents} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService.ts"
import {ProjectProfile} from "./project/ProjectProfile"
import {ProjectMeta} from "@/project/ProjectMeta.ts"

export class Recovery {
    static readonly #RESTORE_FILE_PATH = ".backup"

    readonly #service: StudioService

    constructor(service: StudioService) {this.#service = service}

    async restoreSession(): Promise<Option<ProjectProfile>> {
        const backupResult = await Promises.tryCatch(WorkerAgents.Opfs.list(Recovery.#RESTORE_FILE_PATH))
        if (backupResult.status === "rejected" || backupResult.value.length === 0) {return Option.None}
        const readResult = await Promises.tryCatch(Promise.all([
            WorkerAgents.Opfs.read(`${Recovery.#RESTORE_FILE_PATH}/uuid`)
                .then(x => UUID.validate(x)),
            WorkerAgents.Opfs.read(`${Recovery.#RESTORE_FILE_PATH}/project.od`)
                .then(x => Project.load(this.#service, x.buffer as ArrayBuffer)),
            WorkerAgents.Opfs.read(`${Recovery.#RESTORE_FILE_PATH}/meta.json`)
                .then(x => JSON.parse(new TextDecoder().decode(x.buffer as ArrayBuffer)) as ProjectMeta),
            WorkerAgents.Opfs.read(`${Recovery.#RESTORE_FILE_PATH}/saved`)
                .then(x => x.at(0) === 1)
        ]))
        const deleteResult = await Promises.tryCatch(WorkerAgents.Opfs.delete(Recovery.#RESTORE_FILE_PATH))
        console.debug(`delete backup: "${deleteResult.status}"`)
        if (readResult.status === "rejected") {return Option.None}
        const [uuid, project, meta, saved] = readResult.value
        const session = new ProjectProfile(uuid, project, meta, Option.None, saved)
        console.debug(`restore ${session}, saved: ${saved}`)
        return Option.wrap(session)
    }

    createBackupCommand(): Option<Provider<Promise<void>>> {
        return this.#service.sessionService.getValue().map((session: ProjectProfile) => async () => {
            console.debug("temp storing project")
            const {project, meta, uuid} = session
            return Promises.tryCatch(Promise.all([
                WorkerAgents.Opfs.write(`${Recovery.#RESTORE_FILE_PATH}/uuid`, uuid),
                WorkerAgents.Opfs.write(`${Recovery.#RESTORE_FILE_PATH}/project.od`, new Uint8Array(project.toArrayBuffer())),
                WorkerAgents.Opfs.write(`${Recovery.#RESTORE_FILE_PATH}/meta.json`, new TextEncoder().encode(JSON.stringify(meta))),
                WorkerAgents.Opfs.write(`${Recovery.#RESTORE_FILE_PATH}/saved`, new Uint8Array([session.saved() ? 1 : 0]))
            ])).then(result => console.debug(`backup result: ${result.status}`))
        })
    }
}