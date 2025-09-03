import {int, Option, quantizeCeil, quantizeFloor, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {dbToGain, ppqn, PPQN} from "@opendaw/lib-dsp"
import {AudioFileBox, AudioRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {SampleManager, TrackType} from "@opendaw/studio-adapters"
import {Project} from "../Project"
import {RecordingWorklet} from "../RecordingWorklet"
import {Capture} from "./Capture"
import {RecordTrack} from "./RecordTrack"
import {ColorCodes} from "../ColorCodes"

export namespace RecordAudio {
    type RecordAudioContext = {
        recordingWorklet: RecordingWorklet
        mediaStream: MediaStream
        sampleManager: SampleManager
        audioContext: AudioContext
        project: Project
        capture: Capture
        gainDb: number
    }

    export const start = (
        {recordingWorklet, mediaStream, sampleManager, audioContext, project, capture, gainDb}: RecordAudioContext)
        : Terminable => {
        const terminator = new Terminator()
        const beats = PPQN.fromSignature(1, project.timelineBox.signature.denominator.getValue())
        const {editing, engine, boxGraph} = project
        const trackBox: TrackBox = RecordTrack.findOrCreate(editing, capture.audioUnitBox, TrackType.Audio)
        const uuid = recordingWorklet.uuid
        sampleManager.record(recordingWorklet)
        const streamSource = audioContext.createMediaStreamSource(mediaStream)
        const streamGain = audioContext.createGain()
        streamGain.gain.value = dbToGain(gainDb)
        streamSource.connect(streamGain)
        recordingWorklet.own(Terminable.create(() => {
            streamGain.disconnect()
            streamSource.disconnect()
        }))
        let recordingData: Option<{ fileBox: AudioFileBox, regionBox: AudioRegionBox }> = Option.None
        const createRecordingData = (position: ppqn) => editing.modify(() => {
            const fileDateString = new Date()
                .toISOString()
                .replaceAll("T", "-")
                .replaceAll(".", "-")
                .replaceAll(":", "-")
                .replaceAll("Z", "")
            const fileName = `Recording-${fileDateString}`
            const fileBox = AudioFileBox.create(boxGraph, uuid, box => box.fileName.setValue(fileName))
            const regionBox = AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                box.file.refer(fileBox)
                box.regions.refer(trackBox.regions)
                box.position.setValue(position)
                box.hue.setValue(ColorCodes.forTrackType(TrackType.Audio))
                box.label.setValue("Recording")
            })
            return {fileBox, regionBox}
        })
        terminator.ownAll(
            Terminable.create(() => {
                if (recordingWorklet.numberOfFrames === 0 || recordingData.isEmpty()) {
                    console.debug("Abort recording audio.")
                    sampleManager.remove(uuid)
                    recordingWorklet.terminate()
                } else {
                    const {regionBox: {duration}} = recordingData.unwrap("No recording data available")
                    const {bpm, env: {audioContext: {sampleRate}}} = project
                    const totalSamples: int = PPQN.pulsesToSamples(duration.getValue(), bpm, sampleRate) | 0
                    console.debug(`we need ${totalSamples} to fill the region`)
                    recordingWorklet.limit(totalSamples)
                }
            }),
            engine.position.catchupAndSubscribe(owner => {
                if (!engine.isRecording.getValue()) {return}
                if (recordingData.isEmpty()) {
                    streamGain.connect(recordingWorklet)
                    recordingData = createRecordingData(quantizeFloor(owner.getValue(), beats))
                }
                const {regionBox} = recordingData.unwrap()
                editing.modify(() => {
                    if (regionBox.isAttached()) {
                        const {duration, loopDuration} = regionBox
                        const newDuration = quantizeCeil(engine.position.getValue(), beats) - regionBox.position.getValue()
                        duration.setValue(newDuration)
                        loopDuration.setValue(newDuration)
                    } else {
                        terminator.terminate()
                        recordingData = Option.None
                    }
                }, false)
            })
        )
        return terminator
    }
}