import {Terminable, UUID} from "@opendaw/lib-std"
import {Addressable, Box} from "@opendaw/lib-box"

export interface BoxAdapter extends Addressable, Terminable {
    get box(): Box
    get uuid(): UUID.Bytes
}