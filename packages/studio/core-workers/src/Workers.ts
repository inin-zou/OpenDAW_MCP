import {Messenger} from "@opendaw/lib-runtime"
import {OpfsWorker, SamplePeakWorker} from "@opendaw/lib-fusion"

const messenger: Messenger = Messenger.for(self)

OpfsWorker.init(messenger)
SamplePeakWorker.install(messenger)

messenger.channel("initialize").send("ready")