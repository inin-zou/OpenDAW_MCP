import {Arrays, Progress, UUID} from "@opendaw/lib-std"
import {estimateBpm} from "@opendaw/lib-dsp"
import {Promises} from "@opendaw/lib-runtime"
import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {SampleStorage, WorkerAgents} from "@opendaw/studio-core"
import {SamplePeaks} from "@opendaw/lib-fusion"

export namespace AudioImporter {
    export type Creation = {
        uuid?: UUID.Format,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler: Progress.Handler
    }

    export const run = async (context: AudioContext,
                              {uuid, name, arrayBuffer, progressHandler}: Creation): Promise<Sample> => {
        uuid ??= await UUID.sha256(arrayBuffer) // Must run before decodeAudioData laster, because it will detach the ArrayBuffer
        const audioResult = await Promises.tryCatch(context.decodeAudioData(arrayBuffer))
        if (audioResult.status === "rejected") {return Promise.reject(name)}
        const {value: audioBuffer} = audioResult
        const audioData: AudioData = {
            sampleRate: audioBuffer.sampleRate,
            numberOfFrames: audioBuffer.length,
            numberOfChannels: audioBuffer.numberOfChannels,
            frames: Arrays.create(index => audioBuffer.getChannelData(index), audioBuffer.numberOfChannels)
        }
        const shifts = SamplePeaks.findBestFit(audioData.numberOfFrames)
        const peaks = await WorkerAgents.Peak.generateAsync(
            progressHandler,
            shifts,
            audioData.frames,
            audioData.numberOfFrames,
            audioData.numberOfChannels) as ArrayBuffer
        const meta: SampleMetaData = {
            bpm: estimateBpm(audioBuffer.duration),
            name: name.substring(0, name.lastIndexOf(".")),
            duration: audioBuffer.duration,
            sample_rate: audioBuffer.sampleRate
        }
        await SampleStorage.store(uuid, audioData, peaks, meta)
        return {uuid: UUID.toString(uuid), ...meta}
    }
}