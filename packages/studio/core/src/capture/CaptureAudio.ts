import {
    abort,
    assert,
    Func,
    isDefined,
    isUndefined,
    MutableObservableOption,
    Option,
    safeExecute,
    Terminable,
    warn
} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {AudioUnitBox, CaptureAudioBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {CaptureManager} from "./CaptureManager"
import {RecordAudio} from "./RecordAudio"
import {RecordingContext} from "./RecordingContext"
import {AudioDevices} from "../AudioDevices"

export class CaptureAudio extends Capture<CaptureAudioBox> {
    readonly #stream: MutableObservableOption<MediaStream>

    readonly #streamGenerator: Func<void, Promise<void>>

    #requestChannels: Option<1 | 2> = Option.None
    #gainDb: number = 0.0

    constructor(manager: CaptureManager, audioUnitBox: AudioUnitBox, captureAudioBox: CaptureAudioBox) {
        super(manager, audioUnitBox, captureAudioBox)

        this.#stream = new MutableObservableOption<MediaStream>()
        this.#streamGenerator = Promises.sequential(() => this.#updateStream())

        this.ownAll(
            captureAudioBox.requestChannels.catchupAndSubscribe(owner => {
                const channels = owner.getValue()
                this.#requestChannels = channels === 1 || channels === 2 ? Option.wrap(channels) : Option.None
            }),
            captureAudioBox.gainDb.catchupAndSubscribe(owner => this.#gainDb = owner.getValue()),
            captureAudioBox.deviceId.catchupAndSubscribe(async () => {
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

    get stream(): MutableObservableOption<MediaStream> {return this.#stream}

    get streamDeviceId(): Option<string> {
        return this.streamMediaTrack.map(settings => settings.getSettings().deviceId ?? "")
    }

    get label(): string {return this.streamMediaTrack.mapOr(track => track.label, "Default")}

    get deviceLabel(): Option<string> {return this.streamMediaTrack.map(track => track.label ?? "")}

    get streamMediaTrack(): Option<MediaStreamTrack> {
        return this.#stream.flatMap(stream => Option.wrap(stream.getAudioTracks().at(0)))
    }

    async prepareRecording({audioContext, project}: RecordingContext): Promise<void> {
        console.debug("outputLatency", audioContext.outputLatency)
        if (isUndefined(audioContext.outputLatency)) {
            const approved = await safeExecute(project.env.dialogs?.approve, "Warning",
                "Your browser does not support 'output latency'. This will cause timing issue while recording.",
                "Ignore", "Cancel")
            console.debug("approved", approved)
            if (!approved) {
                return abort("Recording cancelled")
            }
        }
        return this.#streamGenerator()
    }

    startRecording({audioContext, worklets, project, sampleManager}: RecordingContext): Terminable {
        const streamOption = this.#stream
        assert(streamOption.nonEmpty(), "Stream not prepared.")
        const mediaStream = streamOption.unwrap()
        const channelCount = mediaStream.getAudioTracks().at(0)?.getSettings().channelCount ?? 1
        const numChunks = 128
        const recordingWorklet = worklets.createRecording(channelCount, numChunks, audioContext.outputLatency)
        return RecordAudio.start({
            recordingWorklet,
            mediaStream,
            sampleManager,
            audioContext,
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
        return AudioDevices.requestStream({
            deviceId: {exact: deviceId},
            sampleRate: this.manager.project.engine.sampleRate(),
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