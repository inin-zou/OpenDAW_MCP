import {Option, quantizeFloor, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {dbToGain, PPQN} from "@opendaw/lib-dsp"
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
        let writing: Option<{ fileBox: AudioFileBox, regionBox: AudioRegionBox }> = Option.None
        const resizeRegion = () => {
            if (writing.isEmpty()) {return}
            const {regionBox} = writing.unwrap()
            editing.modify(() => {
                if (regionBox.isAttached()) {
                    const {duration, loopDuration} = regionBox
                    const newDuration = Math.floor(PPQN.samplesToPulses(
                        recordingWorklet.numberOfFrames, project.timelineBox.bpm.getValue(), audioContext.sampleRate))
                    duration.setValue(newDuration)
                    loopDuration.setValue(newDuration)
                } else {
                    terminator.terminate()
                    writing = Option.None
                }
            }, false)
        }
        terminator.ownAll(
            Terminable.create(() => {
                if(recordingWorklet.numberOfFrames === 0) {
                    sampleManager.remove(uuid)
                }
                recordingWorklet.finalize().then()
                streamGain.disconnect()
                streamSource.disconnect()
            }),
            engine.position.catchupAndSubscribe(owner => {
                if (writing.isEmpty() && engine.isRecording.getValue()) {
                    streamGain.connect(recordingWorklet)
                    writing = editing.modify(() => {
                        const position = quantizeFloor(owner.getValue(), beats)
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
                }
                resizeRegion()
            }),
            Terminable.create(() => resizeRegion())
        )
        return terminator
    }
}