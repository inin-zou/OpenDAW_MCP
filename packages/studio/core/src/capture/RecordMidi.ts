import {
    byte,
    isUndefined,
    Notifier,
    Option,
    quantizeCeil,
    quantizeFloor,
    Terminable,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {MidiData} from "@opendaw/lib-midi"
import {NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {TrackType} from "@opendaw/studio-adapters"
import {Project} from "../Project"
import {Capture} from "./Capture"
import {RecordTrack} from "./RecordTrack"
import {ColorCodes} from "../ColorCodes"

export namespace RecordMidi {
    type RecordMidiContext = {
        notifier: Notifier<MIDIMessageEvent>,
        project: Project,
        capture: Capture
    }

    export const start = ({notifier, project, capture}: RecordMidiContext): Terminable => {
        console.debug("RecordMidi.start")
        const beats = PPQN.fromSignature(1, project.timelineBox.signature.denominator.getValue())
        const {editing, boxGraph} = project
        const trackBox: TrackBox = RecordTrack.findOrCreate(editing, capture.audioUnitBox, TrackType.Notes)
        const terminator = new Terminator()
        const activeNotes = new Map<byte, NoteEventBox>()
        let writing: Option<{ region: NoteRegionBox, collection: NoteEventCollectionBox }> = Option.None
        terminator.own(project.engine.position.catchupAndSubscribe(owner => {
            if (writing.isEmpty()) {return}
            const writePosition = owner.getValue()
            const {region, collection} = writing.unwrap()
            editing.modify(() => {
                if (region.isAttached() && collection.isAttached()) {
                    const {position, duration, loopDuration} = region
                    const newDuration = quantizeCeil(writePosition, beats) - position.getValue()
                    duration.setValue(newDuration)
                    loopDuration.setValue(newDuration)
                    for (const event of activeNotes.values()) {
                        if (event.isAttached()) {
                            event.duration.setValue(writePosition - event.position.getValue())
                        } else {
                            activeNotes.delete(event.pitch.getValue())
                        }
                    }
                } else {
                    writing = Option.None
                }
            }, false)
        }))
        terminator.ownAll(notifier.subscribe((event: MIDIMessageEvent) => {
            if (!project.engine.isRecording.getValue()) {return}
            const data = event.data
            if (isUndefined(data)) {return}
            const position = project.engine.position.getValue()
            if (MidiData.isNoteOn(data)) {
                const pitch = MidiData.readParam1(data)
                if (writing.isEmpty()) {
                    editing.modify(() => {
                        const collection = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                        const region = NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                            box.regions.refer(trackBox.regions)
                            box.events.refer(collection.owners)
                            box.position.setValue(quantizeFloor(position, beats))
                            box.hue.setValue(ColorCodes.forTrackType(TrackType.Notes))
                        })
                        writing = Option.wrap({region, collection})
                    }, false)
                }
                const {collection} = writing.unwrap()
                editing.modify(() => {
                    activeNotes.set(pitch, NoteEventBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(position)
                        box.duration.setValue(1.0)
                        box.pitch.setValue(pitch)
                        box.velocity.setValue(MidiData.readParam2(data) / 127.0)
                        box.events.refer(collection.events)
                    }))
                }, false)
            } else if (MidiData.isNoteOff(data)) {
                const pitch = MidiData.readParam1(data)
                activeNotes.delete(pitch)
            }
        }))
        return terminator
    }
}