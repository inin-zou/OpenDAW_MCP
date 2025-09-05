import {DefaultObservableValue, Errors, int, Option, panic, RuntimeNotifier, TimeSpan} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AnimationFrame, Files} from "@opendaw/lib-dom"
import {Promises, Wait} from "@opendaw/lib-runtime"
import {ExportStemsConfiguration} from "@opendaw/studio-adapters"
import {Project} from "./project/Project"
import {ProjectMeta} from "./project/ProjectMeta"
import {encodeWavFloat} from "./Wav"
import {AudioWorklets} from "./AudioWorklets"

export namespace AudioOfflineRenderer {
    export const start = async (source: Project,
                                meta: ProjectMeta,
                                optExportConfiguration: Option<ExportStemsConfiguration>,
                                sampleRate: int = 48_000): Promise<void> => {
        const project = source.copy()
        const numStems = ExportStemsConfiguration.countStems(optExportConfiguration)
        const progress = new DefaultObservableValue(0.0)
        const dialog = RuntimeNotifier.progress({headline: "Rendering...", progress})
        project.boxGraph.beginTransaction()
        project.timelineBox.loopArea.enabled.setValue(false)
        project.boxGraph.endTransaction()
        const durationInPulses = project.timelineBox.durationInPulses.getValue()
        const numSamples = PPQN.pulsesToSamples(durationInPulses, project.bpm, sampleRate)
        const context = new OfflineAudioContext(numStems * 2, numSamples, sampleRate)
        const durationInSeconds = numSamples / sampleRate
        const worklets = await AudioWorklets.install(context)
        const engineWorklet = worklets.createEngine(project, optExportConfiguration.unwrapOrUndefined())
        engineWorklet.play()
        engineWorklet.connect(context.destination)
        await engineWorklet.isReady()
        while (!await engineWorklet.queryLoadingComplete()) {await Wait.timeSpan(TimeSpan.seconds(1))}
        const terminable = AnimationFrame.add(() => progress.setValue(context.currentTime / durationInSeconds))
        const buffer = await context.startRendering()
        terminable.terminate()
        dialog.terminate()
        project.terminate()
        if (optExportConfiguration.isEmpty()) {
            await saveWavFile(buffer, meta)
        } else {
            await saveZipFile(buffer, meta, Object.values(optExportConfiguration.unwrap()).map(({fileName}) => fileName))
        }
    }

    const saveWavFile = async (buffer: AudioBuffer, meta: ProjectMeta) => {
        const approved = await RuntimeNotifier.approve({
            headline: "Save Wav-File",
            message: "",
            approveText: "Save"
        })
        if (!approved) {return}
        const wavFile = encodeWavFloat(buffer)
        const suggestedName = `${meta.name}.wav`
        const saveResult = await Promises.tryCatch(Files.save(wavFile, {suggestedName}))
        if (saveResult.status === "rejected" && !Errors.isAbort(saveResult.error)) {
            panic(String(saveResult.error))
        }
    }

    const saveZipFile = async (buffer: AudioBuffer, meta: ProjectMeta, trackNames: ReadonlyArray<string>) => {
        const {default: JSZip} = await import("jszip")
        const dialog = RuntimeNotifier.progress({headline: "Creating Zip File..."})
        const numStems = buffer.numberOfChannels >> 1
        const zip = new JSZip()
        for (let stemIndex = 0; stemIndex < numStems; stemIndex++) {
            const l = buffer.getChannelData(stemIndex * 2)
            const r = buffer.getChannelData(stemIndex * 2 + 1)
            const file = encodeWavFloat({channels: [l, r], sampleRate: buffer.sampleRate, numFrames: buffer.length})
            zip.file(`${trackNames[stemIndex]}.wav`, file, {binary: true})
        }
        const arrayBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: {level: 6}
        })
        dialog.terminate()
        const approved = await RuntimeNotifier.approve({
            headline: "Save Zip",
            message: `Size: ${arrayBuffer.byteLength >> 20}M`,
            approveText: "Save"
        })
        if (!approved) {return}
        const saveResult = await Promises.tryCatch(Files.save(arrayBuffer, {suggestedName: `${meta.name}.zip`}))
        if (saveResult.status === "rejected") {
            panic(String(saveResult.error))
        }
    }
}