import {Arrays, ByteArrayInput, EmptyExec, UUID} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Peaks, SamplePeaks} from "@opendaw/lib-fusion"
import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {WorkerAgents} from "../WorkerAgents"
import {WavFile} from "../WavFile"

export namespace SampleStorage {
    export const clean = () => WorkerAgents.Opfs.delete("samples/v1").catch(EmptyExec)

    export const Folder = "samples/v2"

    export const saveSample = async (uuid: UUID.Bytes,
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

    export const updateSampleMeta = async (uuid: UUID.Bytes, meta: SampleMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return WorkerAgents.Opfs.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }

    export const loadSample = async (uuid: UUID.Bytes, context: AudioContext): Promise<[AudioData, Peaks, SampleMetaData]> => {
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

    export const deleteSample = async (uuid: UUID.Bytes): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        const uuids = await loadTrashedIds()
        uuids.push(UUID.toString(uuid))
        await saveTrashedIds(uuids)
        await WorkerAgents.Opfs.delete(`${path}`)
    }

    export const loadTrashedIds = async (): Promise<Array<UUID.String>> => {
        const {status, value} = await Promises.tryCatch(WorkerAgents.Opfs.read(`${Folder}/trash.json`))
        return status === "rejected" ? [] : JSON.parse(new TextDecoder().decode(value))
    }

    export const saveTrashedIds = async (ids: ReadonlyArray<UUID.String>): Promise<void> => {
        const trash = new TextEncoder().encode(JSON.stringify(ids))
        await WorkerAgents.Opfs.write(`${Folder}/trash.json`, trash)
    }

    export const listSamples = async (): Promise<ReadonlyArray<Sample>> => {
        return WorkerAgents.Opfs.list(Folder)
            .then(files => Promise.all(files.filter(file => file.kind === "directory")
                .map(async ({name}) => {
                    const array = await WorkerAgents.Opfs.read(`${Folder}/${name}/meta.json`)
                    return ({uuid: name as UUID.String, ...(JSON.parse(new TextDecoder().decode(array)) as SampleMetaData)})
                })), () => [])
    }
}