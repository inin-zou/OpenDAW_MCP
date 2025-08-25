import {assert, DefaultObservableValue, isUndefined, ObservableValue, Option, Terminable, warn} from "@opendaw/lib-std"
import {AudioUnitBox, CaptureAudioBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {RecordAudio} from "./RecordAudio"
import {RecordingContext} from "./RecordingContext"
import {CaptureManager} from "./CaptureManager"
import {AudioInputDevices} from "../AudioInputDevices"
import * as console from "node:console"

export class CaptureAudio extends Capture<CaptureAudioBox> {
    readonly #stream: DefaultObservableValue<Option<MediaStream>>

    #requestChannels: Option<1 | 2> = Option.None
    #gainDb: number = 0.0

    constructor(manager: CaptureManager, audioUnitBox: AudioUnitBox, captureBox: CaptureAudioBox) {
        super(manager, audioUnitBox, captureBox)

        this.#stream = new DefaultObservableValue(Option.None)

        this.ownAll(
            captureBox.requestChannels.catchupAndSubscribe(owner => {
                const channels = owner.getValue()
                this.#requestChannels = channels === 1 || channels === 2 ? Option.wrap(channels) : Option.None
            }),
            captureBox.gainDb.catchupAndSubscribe(owner => this.#gainDb = owner.getValue()),
            captureBox.deviceId.catchupAndSubscribe(async () => {
                if (this.armed.getValue()) {
                    await this.#updateStream()
                }
            }),
            this.armed.subscribe(async owner => {
                const armed = owner.getValue()
                if (armed) {
                    await this.#updateStream()
                } else {
                    this.#stopStream()
                }
            })
        )
    }

    get stream(): ObservableValue<Option<MediaStream>> {return this.#stream}

    get streamDeviceId(): Option<string> {
        return this.streamMediaTrack.map(settings => settings.getSettings().deviceId ?? "")
    }

    get deviceLabel(): Option<string> {
        return this.streamMediaTrack.map(track => track.label ?? "")
    }

    get streamMediaTrack(): Option<MediaStreamTrack> {
        return this.#stream.getValue()
            .flatMap(stream => Option.wrap(stream.getAudioTracks().at(0)))
    }

    async prepareRecording({}: RecordingContext): Promise<void> {
        return this.#stream.getValue().match({none: () => this.#updateStream(), some: () => Promise.resolve()})
    }

    startRecording({audioContext, worklets, project, engine, sampleManager}: RecordingContext): Terminable {
        const streamOption = this.#stream.getValue()
        assert(streamOption.nonEmpty(), "Stream not prepared.")
        const mediaStream = streamOption.unwrap()
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

    async #updateStream(): Promise<void> {
        this.#stopStream()
        const deviceId = this.deviceId.getValue().unwrapOrUndefined()
        const channelCount = this.#requestChannels.unwrapOrElse(2) // as of today, browsers cap MediaStream audio to stereo.
        console.debug("request", deviceId, channelCount)
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
            console.debug("got", gotDeviceId, settings?.channelCount)
            if (isUndefined(deviceId) || deviceId === gotDeviceId) {
                this.#stream.setValue(Option.wrap(stream))
            } else {
                this.#stopStream()
                return warn(`Could not find audio device with id: '${deviceId} in ${gotDeviceId}'`)
            }
        })
    }

    #stopStream(): void {
        this.#stream.getValue().ifSome(stream => stream.getAudioTracks().forEach(track => track.stop()))
        this.#stream.setValue(Option.None)
    }
}