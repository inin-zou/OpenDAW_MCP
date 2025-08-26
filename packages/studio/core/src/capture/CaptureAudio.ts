import {assert, Func, isDefined, isUndefined, ObservableOption, Option, Terminable, warn} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {AudioUnitBox, CaptureAudioBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {CaptureManager} from "./CaptureManager"
import {RecordAudio} from "./RecordAudio"
import {RecordingContext} from "./RecordingContext"
import {AudioInputDevices} from "../AudioInputDevices"

export class CaptureAudio extends Capture<CaptureAudioBox> {
    readonly #stream: ObservableOption<MediaStream>

    readonly #streamGenerator: Func<void, Promise<void>>

    #requestChannels: Option<1 | 2> = Option.None
    #gainDb: number = 0.0

    constructor(manager: CaptureManager, audioUnitBox: AudioUnitBox, captureBox: CaptureAudioBox) {
        super(manager, audioUnitBox, captureBox)

        this.#stream = new ObservableOption<MediaStream>()
        this.#streamGenerator = Promises.sequential(() => this.#updateStream())

        this.ownAll(
            captureBox.requestChannels.catchupAndSubscribe(owner => {
                const channels = owner.getValue()
                this.#requestChannels = channels === 1 || channels === 2 ? Option.wrap(channels) : Option.None
            }),
            captureBox.gainDb.catchupAndSubscribe(owner => this.#gainDb = owner.getValue()),
            captureBox.deviceId.catchupAndSubscribe(async () => {
                if (this.armed.getValue()) {
                    await this.#streamGenerator()
                }
            }),
            this.armed.catchupAndSubscribe(async owner => {
                const armed = owner.getValue()
                if (armed) {
                    await this.#streamGenerator()
                } else {
                    this.#stopStream()
                }
            })
        )
    }

    get gainDb(): number {return this.#gainDb}

    get stream(): ObservableOption<MediaStream> {return this.#stream}

    get streamDeviceId(): Option<string> {
        return this.streamMediaTrack.map(settings => settings.getSettings().deviceId ?? "")
    }

    get deviceLabel(): Option<string> {
        return this.streamMediaTrack.map(track => track.label ?? "")
    }

    get streamMediaTrack(): Option<MediaStreamTrack> {
        return this.#stream.flatMap(stream => Option.wrap(stream.getAudioTracks().at(0)))
    }

    async prepareRecording({}: RecordingContext): Promise<void> {
        return this.#streamGenerator()
    }

    startRecording({audioContext, worklets, project, engine, sampleManager}: RecordingContext): Terminable {
        const streamOption = this.#stream
        assert(streamOption.nonEmpty(), "Stream not prepared.")
        const mediaStream = streamOption.unwrap()
        const channelCount = mediaStream.getAudioTracks().at(0)?.getSettings().channelCount ?? 1
        const numChunks = 128
        return RecordAudio.start({
            recordingWorklet: worklets.createRecording(channelCount, numChunks, audioContext.outputLatency),
            mediaStream,
            sampleManager,
            audioContext,
            engine,
            project,
            capture: this,
            gainDb: this.#gainDb
        })
    }

    async #updateStream(): Promise<void> {
        if (this.#stream.nonEmpty()) {
            const stream = this.#stream.unwrap()
            const settings = stream.getAudioTracks().at(0)?.getSettings()
            console.debug(stream.getAudioTracks())
            if (isDefined(settings)) {
                const deviceId = this.deviceId.getValue().unwrapOrUndefined()
                const channelCount = this.#requestChannels.unwrapOrElse(1)
                const satisfyChannelCount = settings.channelCount === channelCount
                const satisfiedDeviceId = isUndefined(deviceId) || deviceId === settings.deviceId
                if (satisfiedDeviceId && satisfyChannelCount) {
                    return Promise.resolve()
                }
            }
        }
        this.#stopStream()
        const deviceId = this.deviceId.getValue().unwrapOrUndefined()
        const channelCount = this.#requestChannels.unwrapOrElse(1) // as of today, browsers cap MediaStream audio to stereo.
        return AudioInputDevices.requestStream({
            deviceId: {exact: deviceId},
            sampleRate: this.manager.project.env.sampleRate,
            sampleSize: 32,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount
        }).then(stream => {
            const tracks = stream.getAudioTracks()
            const settings = tracks.at(0)?.getSettings()
            const gotDeviceId = settings?.deviceId
            console.debug(`new stream id: ${stream.id}, device: ${gotDeviceId ?? "Default"}`)
            if (isUndefined(deviceId) || deviceId === gotDeviceId) {
                this.#stream.wrap(stream)
            } else {
                stream.getAudioTracks().forEach(track => track.stop())
                return warn(`Could not find audio device with id: '${deviceId} in ${gotDeviceId}'`)
            }
        })
    }

    #stopStream(): void {
        this.#stream.clear(stream => stream.getAudioTracks().forEach(track => track.stop()))
    }
}