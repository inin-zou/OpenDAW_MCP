import {Arrays, ByteArrayInput, EmptyExec, UUID} from "@opendaw/lib-std"
import {Peaks, SamplePeaks} from "@opendaw/lib-fusion"
import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {WorkerAgents} from "../WorkerAgents"
import {WavFile} from "../WavFile"

export namespace SampleStorage {
    export const clean = () => WorkerAgents.Opfs.delete("samples/v1").catch(EmptyExec)

    export const Folder = "samples/v2"

    export const store = async (uuid: UUID.Format,
                                audio: AudioData,
                                peaks: ArrayBuffer,
                                meta: SampleMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return Promise.all([
            WorkerAgents.Opfs.write(`${path}/audio.wav`, new Uint8Array(WavFile.encodeFloats({
                channels: audio.frames.slice(),
                numFrames: audio.numberOfFrames,
                sampleRate: audio.sampleRate
            }))),
            WorkerAgents.Opfs.write(`${path}/peaks.bin`, new Uint8Array(peaks)),
            WorkerAgents.Opfs.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
        ]).then(EmptyExec)
    }

    export const updateMeta = async (uuid: UUID.Format, meta: SampleMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return WorkerAgents.Opfs.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }

    export const load = async (uuid: UUID.Format, context: AudioContext): Promise<[AudioData, Peaks, SampleMetaData]> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return Promise.all([
            WorkerAgents.Opfs.read(`${path}/audio.wav`)
                .then(bytes => context.decodeAudioData(bytes.buffer as ArrayBuffer)),
            WorkerAgents.Opfs.read(`${path}/peaks.bin`)
                .then(bytes => SamplePeaks.from(new ByteArrayInput(bytes.buffer))),
            WorkerAgents.Opfs.read(`${path}/meta.json`)
                .then(bytes => JSON.parse(new TextDecoder().decode(bytes)))
        ]).then(([buffer, peaks, meta]) => [{
            sampleRate: buffer.sampleRate,
            numberOfFrames: buffer.length,
            numberOfChannels: buffer.numberOfChannels,
            frames: Arrays.create(index => buffer.getChannelData(index), buffer.numberOfChannels)
        }, peaks, meta])
    }

    export const remove = async (uuid: UUID.Format): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return WorkerAgents.Opfs.delete(`${path}`)
    }

    export const list = async (): Promise<ReadonlyArray<Sample>> => {
        return WorkerAgents.Opfs.list(Folder)
            .then(files => Promise.all(files.filter(file => file.kind === "directory")
                .map(async ({name}) => {
                    const array = await WorkerAgents.Opfs.read(`${Folder}/${name}/meta.json`)
                    return ({uuid: name, ...(JSON.parse(new TextDecoder().decode(array)) as SampleMetaData)})
                })), () => [])
    }
}