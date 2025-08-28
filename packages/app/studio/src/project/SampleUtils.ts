import {panic, UUID} from "@opendaw/lib-std"
import {Errors} from "@opendaw/lib-dom"
import {BoxGraph} from "@opendaw/lib-box"
import {Promises} from "@opendaw/lib-runtime"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {Sample, SampleManager} from "@opendaw/studio-adapters"
import {SampleStorage} from "@opendaw/studio-core"
import {SampleDialogs} from "@/ui/browse/SampleDialogs"
import {Dialogs} from "@/ui/components/dialogs"
import {SampleImporter} from "@/project/SampleImporter"
import {SampleApi} from "@/service/SampleApi"

export namespace SampleUtils {
    export const verify = async (boxGraph: BoxGraph, importer: SampleImporter, audioManager: SampleManager) => {
        const boxes = boxGraph.boxes().filter((box) => box instanceof AudioFileBox)
        if (boxes.length > 0) {
            // check for missing samples
            const online = UUID.newSet<{ uuid: UUID.Format, sample: Sample }>(x => x.uuid)
            online.addMany((await SampleApi.all()).map(sample => ({uuid: UUID.parse(sample.uuid), sample})))
            const offline = UUID.newSet<{ uuid: UUID.Format, sample: Sample }>(x => x.uuid)
            offline.addMany((await SampleStorage.list()).map(sample => ({uuid: UUID.parse(sample.uuid), sample})))
            for (const box of boxes) {
                const uuid = box.address.uuid
                if (online.hasKey(uuid)) {continue}
                const optSample = offline.opt(uuid)
                if (optSample.isEmpty()) {
                    const {
                        status,
                        error,
                        value: sample
                    } = await Promises.tryCatch(SampleDialogs.missingSampleDialog(importer, uuid, box.fileName.getValue()))
                    if (status === "rejected") {
                        if (Errors.isAbort(error)) {continue} else {return panic(String(error))}
                    }
                    await Dialogs.info({
                        headline: "Replaced Sample",
                        message: `${sample.name} has been replaced`
                    })
                    audioManager.invalidate(UUID.parse(sample.uuid))
                }
            }
        }
    }
}