import {assert, Option, Terminable, Terminator, warn} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {RecordingContext} from "./RecordingContext"

export class Recording {
    static async start(context: RecordingContext, countIn: boolean): Promise<Terminable> {
        assert(this.#instance.isEmpty(), "Recording already in progress")
        const {engine, project} = context
        const {captureManager, editing} = project
        const terminator = new Terminator()
        const captures = captureManager.filterArmed()
        console.debug("Filter armed captures...")
        if (captures.length === 0) {
            return warn("No track is armed for Recording")
        }
        const {status, error} =
            await Promises.tryCatch(Promise.all(captures.map(capture => capture.prepareRecording(context))))
        if (status === "rejected") {
            return warn(`Could not prepare recording: ${error}`)
        }
        terminator.ownAll(...captures.map(capture => capture.startRecording(context)))
        engine.startRecording(countIn)
        const {isRecording, isCountingIn} = engine
        const stop = (): void => {
            if (isRecording.getValue() || isCountingIn.getValue()) {return}
            editing.mark()
            terminator.terminate()
        }
        terminator.ownAll(
            engine.isRecording.subscribe(stop),
            engine.isCountingIn.subscribe(stop),
            Terminable.create(() => Recording.#instance = Option.None)
        )
        this.#instance = Option.wrap(new Recording())
        return terminator
    }

    static #instance: Option<Recording> = Option.None

    private constructor() {}
}