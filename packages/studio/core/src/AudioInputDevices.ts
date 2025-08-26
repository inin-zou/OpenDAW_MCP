import {Promises} from "@opendaw/lib-runtime"
import {Arrays, isInstanceOf, warn} from "@opendaw/lib-std"
import {ConstrainDOM} from "@opendaw/lib-dom"

export class AudioInputDevices {
    static async requestPermission() {
        const {status, value: stream} =
            await Promises.tryCatch(navigator.mediaDevices.getUserMedia({audio: true}))
        if (status === "rejected") {return warn("Could not request permission.")}
        stream.getTracks().forEach(track => track.stop())
        await this.update()
    }

    static async requestStream(constraints: MediaTrackConstraints): Promise<MediaStream> {
        const {status, value: stream, error} =
            await Promises.tryCatch(navigator.mediaDevices.getUserMedia({audio: constraints}))
        if (status === "rejected") {
            return warn(isInstanceOf(error, OverconstrainedError) ?
                error.constraint === "deviceId"
                    ? `Could not find device with id: '${ConstrainDOM.resolveString(constraints.deviceId)}'`
                    : error.constraint
                : String(error))
        }
        await this.update()
        return stream
    }

    static async update() {
        this.#available = Arrays.empty()
        const {status, value: devices} = await Promises.tryCatch(navigator.mediaDevices.enumerateDevices())
        if (status === "rejected") {
            return warn("Could not enumerate devices.")
        }
        this.#available = devices.filter(device =>
            device.kind === "audioinput" && device.deviceId !== "" && device.groupId !== "")
    }

    static #available: ReadonlyArray<MediaDeviceInfo> = Arrays.empty()

    static get available(): ReadonlyArray<MediaDeviceInfo> {return this.#available}
}