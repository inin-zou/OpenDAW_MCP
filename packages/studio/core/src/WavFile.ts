import {Arrays, panic} from "@opendaw/lib-std"

export namespace WavFile {
    const MAGIC_RIFF = 0x46464952
    const MAGIC_WAVE = 0x45564157
    const MAGIC_FMT = 0x20746d66
    const MAGIC_DATA = 0x61746164

    export type Audio = {
        channels: ReadonlyArray<Float32Array>,
        sampleRate: number,
        numFrames: number
    }

    export const decodeFloats = (buffer: ArrayBuffer): Audio => {
        const view = new DataView(buffer)
        if (view.getUint32(0, true) !== MAGIC_RIFF
            || view.getUint32(8, true) !== MAGIC_WAVE) {
            return panic("Not a RIFF/WAVE file")
        }
        let fmtOffset = -1
        let dataOffset = -1
        let dataSize = 0
        for (let o = 12; o + 8 <= view.byteLength;) {
            const id = view.getUint32(o, true)
            const size = view.getUint32(o + 4, true)
            const next = o + 8 + ((size + 1) & ~1)
            if (id === MAGIC_FMT) fmtOffset = o + 8
            if (id === MAGIC_DATA) {
                dataOffset = o + 8
                dataSize = size
            }
            o = next
        }
        if (fmtOffset < 0 || dataOffset < 0) {
            return panic("Missing fmt or data chunk")
        }
        const audioFormat = view.getUint16(fmtOffset, true)  // 3 = IEEE float
        const numChannels = view.getUint16(fmtOffset + 2, true)
        const sampleRate = view.getUint32(fmtOffset + 4, true)
        const blockAlign = view.getUint16(fmtOffset + 12, true)
        const bitsPerSample = view.getUint16(fmtOffset + 14, true)
        if (audioFormat !== 3 || bitsPerSample !== 32) {
            return panic("Expected 32-bit float WAV (format 3)")
        }
        if (blockAlign !== numChannels * 4) {
            return panic("Invalid block alignment")
        }
        const numFrames = Math.floor(dataSize / blockAlign)
        const interleaved = new Float32Array(buffer, dataOffset, numFrames * numChannels)
        const channels = Arrays.create(() => new Float32Array(numFrames), numChannels)
        for (let i = 0, w = 0; i < numFrames; i++) {
            for (let c = 0; c < numChannels; c++) {
                channels[c][i] = interleaved[w++]
            }
        }
        return {channels, sampleRate, numFrames}
    }

    export const encodeFloats = (audio: Audio | AudioBuffer): ArrayBuffer => {
        const bytesPerChannel = Float32Array.BYTES_PER_ELEMENT
        const sampleRate = audio.sampleRate
        let numFrames: number
        let numberOfChannels: number
        let channels: ReadonlyArray<Float32Array>
        if (audio instanceof AudioBuffer) {
            channels = Arrays.create(index => audio.getChannelData(index), audio.numberOfChannels)
            numFrames = audio.length
            numberOfChannels = audio.numberOfChannels
        } else {
            channels = audio.channels
            numFrames = audio.numFrames
            numberOfChannels = audio.channels.length
        }
        const size = 44 + numFrames * numberOfChannels * bytesPerChannel
        const buf = new ArrayBuffer(size)
        const view = new DataView(buf)
        view.setUint32(0, MAGIC_RIFF, true)
        view.setUint32(4, size - 8, true)
        view.setUint32(8, MAGIC_WAVE, true)
        view.setUint32(12, MAGIC_FMT, true)
        view.setUint32(16, 16, true) // chunk length
        view.setUint16(20, 3, true) // compression
        view.setUint16(22, numberOfChannels, true)
        view.setUint32(24, sampleRate, true)
        view.setUint32(28, sampleRate * numberOfChannels * bytesPerChannel, true)
        view.setUint16(32, numberOfChannels * bytesPerChannel, true)
        view.setUint16(34, 8 * bytesPerChannel, true)
        view.setUint32(36, MAGIC_DATA, true)
        view.setUint32(40, numberOfChannels * numFrames * bytesPerChannel, true)
        let w = 44
        for (let i = 0; i < numFrames; ++i) {
            for (let j = 0; j < numberOfChannels; ++j) {
                view.setFloat32(w, channels[j][i], true)
                w += bytesPerChannel
            }
        }
        return view.buffer
    }
}