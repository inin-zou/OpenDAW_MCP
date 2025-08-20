import {MutableObservableValue, Option, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {CaptureBox} from "@opendaw/studio-adapters"

import {RecordingContext} from "./RecordingContext"

export abstract class Capture<BOX extends CaptureBox = CaptureBox> implements Terminable {
    readonly #terminator = new Terminator()

    readonly #audioUnitBox: AudioUnitBox
    readonly #captureBox: BOX

    #filterDeviceId: Option<string> = Option.None

    protected constructor(audioUnitBox: AudioUnitBox, captureBox: BOX) {
        this.#audioUnitBox = audioUnitBox
        this.#captureBox = captureBox

        this.#terminator.ownAll(
            this.#captureBox.deviceId.catchupAndSubscribe(owner => {
                const id = owner.getValue()
                this.#filterDeviceId = id.length > 0 ? Option.wrap(id) : Option.None
            })
        )
    }

    abstract prepareRecording(context: RecordingContext): Promise<void>
    abstract startRecording(context: RecordingContext): Terminable

    get uuid(): UUID.Format {return this.#audioUnitBox.address.uuid}
    get audioUnitBox(): AudioUnitBox {return this.#audioUnitBox}
    get captureBox(): BOX {return this.#captureBox}
    get armed(): MutableObservableValue<boolean> {return this.#captureBox.armed}

    get filterDeviceId(): Option<string> {return this.#filterDeviceId}

    own<T extends Terminable>(terminable: T): T {return this.#terminator.own(terminable)}
    ownAll<T extends Terminable>(...terminables: ReadonlyArray<T>): void {this.#terminator.ownAll(...terminables)}
    terminate(): void {this.#terminator.terminate()}
}