import {ProjectDecoder} from "@opendaw/studio-adapters"
import {
    AudioUnitBox,
    BoxVisitor,
    GrooveShuffleBox,
    ValueEventBox,
    ValueEventCurveBox,
    ZeitgeistDeviceBox
} from "@opendaw/studio-boxes"
import {asInstanceOf, isEnumValue, UUID} from "@opendaw/lib-std"
import {AudioUnitContentType} from "@opendaw/studio-enums"

export class ProjectMigration {
    static migrate({boxGraph, mandatoryBoxes}: ProjectDecoder.Skeleton): void {
        const {rootBox} = mandatoryBoxes
        if (rootBox.groove.targetAddress.isEmpty()) {
            console.debug("Migrate to global GrooveShuffleBox")
            boxGraph.beginTransaction()
            rootBox.groove.refer(GrooveShuffleBox.create(boxGraph, UUID.generate()))
            boxGraph.endTransaction()
        }
        const globalShuffle = asInstanceOf(rootBox.groove.targetVertex.unwrap(), GrooveShuffleBox).label
        if (globalShuffle.getValue() !== "Groove Shuffle") {
            boxGraph.beginTransaction()
            globalShuffle.setValue("Groove Shuffle")
            boxGraph.endTransaction()
        }
        // TODO We can remove this when we delete all not-migrated, local(!) project files from my machine
        boxGraph.boxes().forEach(box => box.accept<BoxVisitor>({
            visitZeitgeistDeviceBox: (box: ZeitgeistDeviceBox) => {
                if (box.groove.targetAddress.isEmpty()) {
                    console.debug("Migrate 'ZeitgeistDeviceBox' to GrooveShuffleBox")
                    boxGraph.beginTransaction()
                    box.groove.refer(rootBox.groove.targetVertex.unwrap())
                    boxGraph.endTransaction()
                }
            },
            visitValueEventBox: (eventBox: ValueEventBox) => {
                const slope = eventBox.slope.getValue()
                if (isNaN(slope)) {return} // already migrated, nothing to do
                if (slope === 0.0) { // never set
                    console.debug("Migrate 'ValueEventBox'")
                    boxGraph.beginTransaction()
                    eventBox.slope.setValue(NaN)
                    boxGraph.endTransaction()
                } else if (eventBox.interpolation.getValue() === 1) { // linear
                    if (slope === 0.5) {
                        console.debug("Migrate 'ValueEventBox' to linear")
                        boxGraph.beginTransaction()
                        eventBox.slope.setValue(NaN)
                        boxGraph.endTransaction()
                    } else {
                        console.debug("Migrate 'ValueEventBox' to new ValueEventCurveBox")
                        boxGraph.beginTransaction()
                        ValueEventCurveBox.create(boxGraph, UUID.generate(), box => {
                            box.event.refer(eventBox.interpolation)
                            box.slope.setValue(slope)
                        })
                        eventBox.slope.setValue(NaN)
                        boxGraph.endTransaction()
                    }
                }
            },
            visitAudioUnitBox: (box: AudioUnitBox): void => {
                if (isEnumValue(AudioUnitContentType, box.contentType.getValue())) {return}
                boxGraph.beginTransaction()
                box.contentType.setValue(
                    box.input.pointerHub.incoming().at(0)?.box
                        .accept<BoxVisitor<AudioUnitContentType>>({
                            visitVaporisateurDeviceBox: () => AudioUnitContentType.Notes,
                            visitNanoDeviceBox: () => AudioUnitContentType.Notes,
                            visitPlayfieldDeviceBox: () => AudioUnitContentType.Notes,
                            visitTapeDeviceBox: () => AudioUnitContentType.Audio
                        }) ?? AudioUnitContentType.None)
                boxGraph.endTransaction()
            }
        }))
    }
}