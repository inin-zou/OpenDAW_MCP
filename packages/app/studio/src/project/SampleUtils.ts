import {Errors, panic, RuntimeNotifier, UUID} from "@opendaw/lib-std"
import {BoxGraph} from "@opendaw/lib-box"
import {Promises} from "@opendaw/lib-runtime"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {Sample, SampleManager} from "@opendaw/studio-adapters"
import {SampleAPI, SampleImporter, SampleStorage} from "@opendaw/studio-core"
import {SampleDialogs} from "@/ui/browse/SampleDialogs"

export namespace SampleUtils {
    export const verify = async (boxGraph: BoxGraph,
                                 importer: SampleImporter,
                                 sampleAPI: SampleAPI,
                                 sampleManager: SampleManager) => {
        const boxes = boxGraph.boxes().filter((box) => box instanceof AudioFileBox)
        if (boxes.length > 0) {
            // check for missing samples
            const online = UUID.newSet<{ uuid: UUID.Format, sample: Sample }>(x => x.uuid)
            online.addMany((await sampleAPI.all()).map(sample => ({uuid: UUID.parse(sample.uuid), sample})))
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
                    await RuntimeNotifier.info({
                        headline: "Replaced Sample",
                        message: `${sample.name} has been replaced`
                    })
                    sampleManager.invalidate(UUID.parse(sample.uuid))
                }
            }
        }
    }
}