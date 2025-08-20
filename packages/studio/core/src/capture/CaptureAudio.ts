import {assert, isUndefined, Option, panic, Terminable} from "@opendaw/lib-std"
import {AudioUnitBox, CaptureAudioBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {RecordAudio} from "./RecordAudio"
import {RecordingContext} from "./RecordingContext"

export class CaptureAudio extends Capture<CaptureAudioBox> {
    #stream: Option<MediaStream> = Option.None

    #requestChannels: Option<1 | 2> = Option.None
    #gainDb: number = 0.0

    constructor(audioUnitBox: AudioUnitBox, captureBox: CaptureAudioBox) {
        super(audioUnitBox, captureBox)

        this.ownAll(
            captureBox.requestChannels.catchupAndSubscribe(owner => {
                const channels = owner.getValue()
                this.#requestChannels = channels === 1 || channels === 2 ? Option.wrap(channels) : Option.None
            }),
            captureBox.gainDb.catchupAndSubscribe(owner => this.#gainDb = owner.getValue())
        )
    }

    async prepareRecording({audioContext: {sampleRate}}: RecordingContext): Promise<void> {
        const deviceId = this.filterDeviceId.unwrapOrUndefined()
        return navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId,
                sampleRate,
                sampleSize: 32,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: this.#requestChannels.unwrapOrElse(2) // as of today, browsers cap MediaStream audio to stereo.
            }
        }).then(stream => {
            const tracks = stream.getAudioTracks()
            if (isUndefined(deviceId) || deviceId === tracks.at(0)?.getSettings().deviceId) {
                this.#stream = Option.wrap(stream)
            } else {
                tracks.forEach(track => track.stop())
                return panic(`Could not find audio device with id: '${deviceId}'`)
            }
        })
    }

    startRecording({audioContext, worklets, project, engine, sampleManager}: RecordingContext): Terminable {
        assert(this.#stream.nonEmpty(), "Stream not prepared.")
        const mediaStream = this.#stream.unwrap()
        return Terminable.many(
            RecordAudio.start({
                recordingWorklet: worklets.createRecording(2, 128, audioContext.outputLatency),
                mediaStream,
                sampleManager,
                audioContext,
                engine,
                project,
                capture: this,
                gainDb: this.#gainDb
            }),
            Terminable.create(() => mediaStream.getTracks().forEach(track => track.stop()))
        )
    }
}