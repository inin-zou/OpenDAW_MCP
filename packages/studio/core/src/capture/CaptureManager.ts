import {asInstanceOf, isDefined, Nullish, SortedSet, Subscription, Terminable, UUID} from "@opendaw/lib-std"
import {AudioUnitBox, BoxVisitor, CaptureAudioBox, CaptureMidiBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {Project} from "../Project"
import {CaptureMidi} from "./CaptureMidi"
import {CaptureAudio} from "./CaptureAudio"

export class CaptureManager implements Terminable {
    readonly #subscription: Subscription
    readonly #captures: SortedSet<UUID.Format, Capture>

    constructor({rootBox}: Project) {
        this.#captures = UUID.newSet<Capture>(unit => unit.uuid)

        this.#subscription = rootBox.audioUnits.pointerHub.catchupAndSubscribeTransactual({
            onAdd: ({box}) => {
                const audioUnitBox = asInstanceOf(box, AudioUnitBox)
                const capture: Nullish<Capture> = audioUnitBox.capture.targetVertex
                    .ifSome(({box}) => box.accept<BoxVisitor<Capture>>({
                        visitCaptureMidiBox: (box: CaptureMidiBox) => new CaptureMidi(audioUnitBox, box),
                        visitCaptureAudioBox: (box: CaptureAudioBox) => new CaptureAudio(audioUnitBox, box)
                    }))
                if (isDefined(capture)) {this.#captures.add(capture)}
            },
            onRemove: ({box: {address: {uuid}}}) => this.#captures.removeByKeyIfExist(uuid)?.terminate()
        })
    }

    filterArmed(): ReadonlyArray<Capture> {
        return this.#captures.values()
            .filter(capture => capture.armed.getValue() && capture.audioUnitBox.input.pointerHub.nonEmpty())
    }

    terminate(): void {
        this.#subscription.terminate()
        this.#captures.clear()
    }
}