import {asDefined, DefaultObservableValue, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioFileBox, AudioRegionBox} from "@opendaw/studio-boxes"
import {Sample} from "@opendaw/studio-adapters"
import {ColorCodes, InstrumentFactories, SampleStorage} from "@opendaw/studio-core"
import {HTMLSelection} from "@/ui/HTMLSelection"
import {StudioService} from "@/service/StudioService"
import {Dialogs} from "../components/dialogs"
import {Projects} from "@/project/Projects"
import {SampleApi} from "@/service/SampleApi"

export class SampleService {
    readonly #service: StudioService
    readonly #selection: HTMLSelection

    constructor(service: StudioService, selection: HTMLSelection) {
        this.#service = service
        this.#selection = selection
    }

    requestTapes(): void {
        if (!this.#service.hasProfile) {return}
        const project = this.#service.project
        const {editing, boxGraph, rootBoxAdapter} = project
        editing.modify(() => {
            const samples = this.#samples()
            const startIndex = rootBoxAdapter.audioUnits.adapters().length
            samples.forEach(({uuid: uuidAsString, name, bpm, duration: durationInSeconds}, index) => {
                const uuid = UUID.parse(uuidAsString)
                const {trackBox} = project.api.createInstrument(InstrumentFactories.Tape, {index: startIndex + index})
                const audioFileBox = boxGraph.findBox<AudioFileBox>(uuid)
                    .unwrapOrElse(() => AudioFileBox.create(boxGraph, uuid, box => {
                        box.fileName.setValue(name)
                        box.startInSeconds.setValue(0)
                        box.endInSeconds.setValue(durationInSeconds)
                    }))
                const duration = Math.round(PPQN.secondsToPulses(durationInSeconds, bpm))
                AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                    box.position.setValue(0)
                    box.duration.setValue(duration)
                    box.loopDuration.setValue(duration)
                    box.regions.refer(trackBox.regions)
                    box.hue.setValue(ColorCodes.forTrackType(trackBox.type.getValue()))
                    box.label.setValue(name)
                    box.file.refer(audioFileBox)
                })
            })
        })
    }

    async deleteSelected() {return this.deleteSamples(...this.#samples())}

    async deleteSamples(...samples: ReadonlyArray<Sample>) {
        const processDialog = Dialogs.progress("Checking Sample Usages", new DefaultObservableValue(0.5))
        const used = await Projects.listUsedSamples()
        const online = new Set<string>((await SampleApi.all()).map(({uuid}) => uuid))
        processDialog.close()
        const approved = await Dialogs.approve({
            headline: "Remove Sample(s)?",
            message: "This cannot be undone!",
            approveText: "Remove"
        })
        if (!approved) {return}
        for (const {uuid, name} of samples) {
            const isUsed = used.has(uuid)
            const isOnline = online.has(uuid)
            if (isUsed && !isOnline) {
                await Dialogs.info({headline: "Cannot Delete Sample", message: `${name} is used by a project.`})
            } else {
                await SampleStorage.remove(UUID.parse(uuid))
            }
        }
    }

    #samples(): ReadonlyArray<Sample> {
        const selected = this.#selection.getSelected()
        return selected.map(element => JSON.parse(asDefined(element.getAttribute("data-selection"))) as Sample)
    }
}