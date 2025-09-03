import {Peaks, SamplePeakWorker} from "@opendaw/lib-fusion"
import {Arrays, assert, int, Nullable} from "@opendaw/lib-std"
import {RenderQuantum} from "./RenderQuantum"

export class PeaksWriter implements Peaks, Peaks.Stage {
    readonly data: ReadonlyArray<Int32Array>
    readonly stages: ReadonlyArray<Peaks.Stage>
    readonly dataOffset: int = 0
    readonly shift: int = 7
    readonly dataIndex: Int32Array

    numFrames: int = 0 | 0

    constructor(readonly numChannels: int) {
        this.data = Arrays.create(() => new Int32Array(1 << 20), numChannels) // TODO auto-resize
        this.dataIndex = new Int32Array(numChannels)
        this.stages = [this]
    }

    get numPeaks(): int {return Math.ceil(this.numFrames / (1 << this.shift))}

    unitsEachPeak(): int {return 1 << this.shift}

    append(frames: ReadonlyArray<Float32Array>): void {
        for (let channel = 0; channel < this.numChannels; ++channel) {
            const channelFrames = frames[channel]
            assert(channelFrames.length === RenderQuantum, "Invalid number of frames.")
            let min = Number.POSITIVE_INFINITY
            let max = Number.NEGATIVE_INFINITY
            for (let i = 0; i < RenderQuantum; ++i) {
                const frame = channelFrames[i]
                min = Math.min(frame, min)
                max = Math.max(frame, max)
            }
            this.data[channel][this.dataIndex[channel]++] = SamplePeakWorker.pack(min, max)
        }
        this.numFrames += RenderQuantum
    }

    nearest(_unitsPerPixel: number): Nullable<Peaks.Stage> {return this.stages.at(0) ?? null}
}