import css from "./NoteEditor.sass?inline"
import {Events, Html, Keyboard} from "@opendaw/lib-dom"
import {
    byte,
    DefaultObservableValue,
    int,
    isInstanceOf,
    Lifecycle,
    Option,
    Procedure,
    Terminable,
    UUID
} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {PitchEditor} from "@/ui/timeline/editors/notes/pitch/PitchEditor.tsx"
import {PitchPositioner} from "@/ui/timeline/editors/notes/pitch/PitchPositioner.ts"
import {TimelineRange} from "@/ui/timeline/TimelineRange.ts"
import {Snapping} from "@/ui/timeline/Snapping.ts"
import {NoteEventBox} from "@opendaw/studio-boxes"
import {PianoRoll} from "@/ui/timeline/editors/notes/pitch/PianoRoll.tsx"
import {ScaleConfig} from "@/ui/timeline/editors/notes/pitch/ScaleConfig.ts"
import {PitchEditorHeader} from "@/ui/timeline/editors/notes/pitch/PitchEditorHeader.tsx"
import {FilteredSelection, NoteEventBoxAdapter, NoteSender, NoteStreamReceiver} from "@opendaw/studio-adapters"
import {ObservableModifyContext} from "@/ui/timeline/ObservableModifyContext.ts"
import {PropertyEditor} from "./property/PropertyEditor.tsx"
import {NoteModifier} from "@/ui/timeline/editors/notes/NoteModifier.ts"
import {installEditorMainBody} from "@/ui/timeline/editors/EditorBody.ts"
import {EditorMenuCollector} from "@/ui/timeline/editors/EditorMenuCollector.ts"
import {installNoteViewMenu} from "@/ui/timeline/editors/notes/NoteViewMenu.ts"
import {PropertyHeader} from "@/ui/timeline/editors/notes/property/PropertyHeader.tsx"
import {NotePropertyVelocity, PropertyAccessor} from "@/ui/timeline/editors/notes/property/PropertyAccessor.ts"
import {NoteEventOwnerReader} from "@/ui/timeline/editors/EventOwnerReader.ts"
import {createPitchMenu} from "@/ui/timeline/editors/notes/pitch/PitchMenu.ts"
import {CaptureMidi} from "@opendaw/studio-core"
import {MidiData} from "@opendaw/lib-midi"

const className = Html.adoptStyleSheet(css, "NoteEditor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    menu: EditorMenuCollector
    range: TimelineRange
    snapping: Snapping
    reader: NoteEventOwnerReader
}

export const NoteEditor =
    ({lifecycle, service, menu: {editMenu, viewMenu}, range, snapping, reader}: Construct) => {
        const {project} = service
        const {captureDevices, editing, engine, boxGraph, boxAdapters} = project
        const optCapture: Option<CaptureMidi> = reader.trackBoxAdapter
            .flatMap((adapter) => captureDevices.get(adapter.audioUnit.address.uuid))
            .map(capture => isInstanceOf(capture, CaptureMidi) ? capture : null)
        const stepRecording = lifecycle.own(new DefaultObservableValue(false))
        const pitchPositioner = lifecycle.own(new PitchPositioner())
        const scale = lifecycle.own(new ScaleConfig())
        const modifyContext = new ObservableModifyContext<NoteModifier>(editing)
        const propertyOwner = new DefaultObservableValue<PropertyAccessor>(NotePropertyVelocity)
        const selection: FilteredSelection<NoteEventBoxAdapter> = lifecycle.own(project.selection
            .createFilteredSelection(box => box instanceof NoteEventBox, {
                fx: adapter => adapter.box,
                fy: vertex => project.boxAdapters.adapterFor(vertex.box, NoteEventBoxAdapter)
            }))
        const audioUnitAddress = reader.trackBoxAdapter.unwrap().audioUnit.address
        const noteReceiver = lifecycle.own(new NoteStreamReceiver(project.liveStreamReceiver, audioUnitAddress))
        const noteSender: NoteSender = {
            noteOn: (note, velocity) => engine.noteOn(audioUnitAddress.uuid, note, velocity),
            noteOff: (note) => engine.noteOff(audioUnitAddress.uuid, note)
        }
        const pitchHeader: HTMLElement = (
            <div className="pitch-header">
                <PitchEditorHeader lifecycle={lifecycle}
                                   selection={selection}
                                   editing={editing}
                                   modifyContext={modifyContext}
                                   scale={scale}/>
                <PianoRoll lifecycle={lifecycle}
                           positioner={pitchPositioner}
                           scale={scale}
                           noteReceiver={noteReceiver}
                           noteSender={noteSender}/>
            </div>
        )
        const pitchBody: HTMLElement = (
            <div className="pitch-body">
                <PitchEditor lifecycle={lifecycle}
                             graph={boxGraph}
                             boxAdapters={boxAdapters}
                             range={range}
                             editing={editing}
                             snapping={snapping}
                             positioner={pitchPositioner}
                             scale={scale}
                             noteSender={noteSender}
                             selection={selection}
                             modifyContext={modifyContext}
                             reader={reader}/>
            </div>
        )
        lifecycle.ownAll(
            selection.catchupAndSubscribe({
                onSelected: (adapter: NoteEventBoxAdapter) => adapter.onSelected(),
                onDeselected: (adapter: NoteEventBoxAdapter) => adapter.onDeselected()
            }),
            viewMenu.attach(installNoteViewMenu(range, reader, pitchPositioner, reader.content.events)),
            editMenu.attach(createPitchMenu({
                editing: editing,
                snapping: snapping,
                selection: selection,
                events: reader.content.events,
                stepRecording
            })),
            installEditorMainBody({element: pitchBody, range, reader}),
            Html.watchResize(pitchBody, (() => {
                let init = true
                let centerNote: int = 60
                return () => {
                    if (init) {
                        init = false
                        centerNote = 60
                    } else {
                        centerNote = pitchPositioner.centerNote
                    }
                    pitchPositioner.height = pitchHeader.clientHeight
                    pitchPositioner.centerNote = centerNote
                }
            })()))
        const element: HTMLElement = (
            <div className={className}>
                {pitchHeader}
                {pitchBody}
                <PropertyHeader lifecycle={lifecycle}
                                propertyOwner={propertyOwner}/>
                <PropertyEditor lifecycle={lifecycle}
                                range={range}
                                editing={editing}
                                selection={selection}
                                snapping={snapping}
                                propertyOwner={propertyOwner}
                                modifyContext={modifyContext}
                                reader={reader}/>
            </div>
        )
        const modifySelection = (procedure: Procedure<NoteEventBoxAdapter>): void => {
            const adapters = selection.selected()
            if (adapters.length === 0) {return}
            editing.modify(() => adapters.forEach(procedure))
        }
        lifecycle.ownAll(
            Events.subscribe(element, "keydown", event => {
                if (event.altKey || Keyboard.isControlKey(event) || Events.isTextInput(event.target)) {return}
                event.preventDefault()
                switch (event.key) {
                    case "ArrowUp": {
                        if (event.shiftKey) {
                            modifySelection(({box, pitch}: NoteEventBoxAdapter) => {
                                if (pitch + 12 <= 127) {box.pitch.setValue(pitch + 12)}
                            })
                        } else {
                            modifySelection(({box, pitch}: NoteEventBoxAdapter) =>
                                box.pitch.setValue(Math.max(pitch + 1, 0)))
                        }
                        break
                    }
                    case "ArrowDown": {
                        if (event.shiftKey) {
                            modifySelection(({box, pitch}: NoteEventBoxAdapter) => {
                                if (pitch - 12 >= 0) {box.pitch.setValue(pitch - 12)}
                            })
                        } else {
                            modifySelection(({box, pitch}: NoteEventBoxAdapter) =>
                                box.pitch.setValue(Math.max(pitch - 1, 0)))
                        }
                        break
                    }
                    case "ArrowLeft": {
                        if (selection.nonEmpty()) {
                            if (!event.shiftKey) {
                                modifySelection(({box, position}: NoteEventBoxAdapter) =>
                                    box.position.setValue(position - snapping.value))
                            }
                        } else if (!engine.isPlaying.getValue()) {
                            engine.setPosition(Math.max(reader.offset,
                                snapping.ceil(engine.position.getValue()) - snapping.value))
                        }
                        break
                    }
                    case "ArrowRight": {
                        if (selection.nonEmpty()) {
                            if (!event.shiftKey) {
                                modifySelection(({box, position}: NoteEventBoxAdapter) =>
                                    box.position.setValue(position + snapping.value))
                            }
                        } else if (!engine.isPlaying.getValue()) {
                            engine.setPosition(snapping.floor(engine.position.getValue()) + snapping.value)
                        }
                        break
                    }
                }
            }),
            optCapture.mapOr((capture: CaptureMidi) => capture.subscribeNotes(event => {
                if (engine.isPlaying.getValue() || !stepRecording.getValue()) {return}
                MidiData.accept(event.data, {
                    noteOn(pitch: byte, velocity: byte) {
                        const position = snapping.floor(engine.position.getValue())
                        const duration = snapping.value
                        let createdNote = false
                        editing.modify(() => {
                            NoteEventBox.create(boxGraph, UUID.generate(), box => {
                                box.events.refer(reader.content.box.events)
                                box.position.setValue(position - reader.position)
                                box.duration.setValue(duration)
                                box.pitch.setValue(pitch)
                                box.velocity.setValue(velocity)
                            })
                            createdNote = true
                        })
                        if (createdNote) {
                            engine.setPosition(position + duration)
                        }
                    }
                })
            }), Terminable.Empty)
        )
        return element
    }