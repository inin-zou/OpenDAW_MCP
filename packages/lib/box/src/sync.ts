import {Nullish, UUID} from "@opendaw/lib-std"
import {AddressLayout} from "./address"

export type UpdateTask<M> =
    | { type: "new", name: keyof M, uuid: UUID.Bytes, buffer: ArrayBufferLike }
    | { type: "update-primitive", address: AddressLayout, value: unknown }
    | { type: "update-pointer", address: AddressLayout, target: Nullish<AddressLayout> }
    | { type: "delete", uuid: UUID.Bytes }

export interface Synchronization<M> {
    sendUpdates(updates: ReadonlyArray<UpdateTask<M>>): void
    checksum(value: Int8Array): Promise<void>
}