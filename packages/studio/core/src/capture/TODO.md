# TODO

## Bugs

* Allow dropping devices in the timeline header column

## Next

* Fully implement capture
    * ~~List all devices~~
    * ~~If MIDI, select all channels or specific channel~~
    * If Audio, let the user select the number of channels (max and default is 2)
    * If Audio, how to adjust pre-gain?
    * MIDI Controller (values)

## Level #1

* Stop (~~start~~) recording at quantized positions
* Find a way to overlay, replace, mix on existing regions
* Find a way to handle loops/jumps while recording
* Respect zero-crossing
* Sample editor

## Done

* ~~Inform the user if there is no outputLatency~~
* ~~Implement monitor~~
    * ~~If audio, show peak-meter~~
* ~~Handle external changes to the project (deletion of audio-units, tracks, regions, etc. while recording)~~
* ~~Ignore just recorded midi data while recording~~
* ~~Refactor MIDI learning for the new capture system~~
* ~~If tracks, use the first available audio-unit to record~~
* ~~If the project is empty, ask if the user wants to record audio or midi~~
* ~~Play global transport when starting a clip~~
* ~~Severe bug in undo~~
* ~~Store capture filters in boxes~~
* ~~Template "Liquid" and "Release" timing issue because of CaptureManager~~
* ~~We need a flag to identify audio-unit's main content (audio or MIDI)~~
* ~~Generate peaks while recording~~
* ~~Store samples in OPFS (to upload later into the cloud)~~
* ~~Shift + Record to suppress count-in~~
* ~~Recording-gain~~

## Level #2

* Record samples into Playfield and clips
* Better audio playback algorithms
    * time-stretch
    * event-based warping
* Allow recording from other audio-units (baking)