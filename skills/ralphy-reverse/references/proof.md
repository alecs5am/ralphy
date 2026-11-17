# Proving a copy

Bars that held in the owner's production runs (2026-11, marketing reels copied as HyperFrames
compositions). `ralphy tool compare <ref> <render>` reports most of them.

## Pass bar

| Check | Bar | Where |
|---|---|---|
| Cuts | every reference cut matched on the same frame, at most ±1; none missing, none extra | `compare` cuts |
| Cuts on sound | each cut on the frame nearest its sound's arrival | `beats.json` of both |
| Reused audio | lag within ±1 ms after compensation, correlation ≥ 0.99 in every window | `compare` audio |
| Level | integrated LUFS equal to the reference (keep the reference's level even if it is far from -14) | `ralphy tool loudness <render> --match <ref>` |
| Density | median shot and still share not above the reference's | `compare` video |
| Geometry | subject boxes and text within a few source pixels at matched frames | pair sheets, dense windows |
| Length | same duration; audio stream not longer than the picture | `compare`, ffprobe |

Read pair sheets at every shot and at 8 or more fast moments, plus dense windows around them, not
only the default 0.5 s sheet.

## Failures that slipped past "it renders"

- **Static stills with a push-in.** A film edit at 28.7% frozen frame pairs against the reference's
  2.4% was rejected by the owner: "the reference's editing was miles ahead, and these dumb static
  frames with a camera push-in are very bad". Footage filled the frame 18-24% of the runtime
  against 63% in the reference ("table-led, not film-led"). Fix: shots back to the reference length
  (about 1.6 s or less there), live footage keeps playing under graphics, no global zoom as motion.
- **Cuts early against the sound.** The owner on MOTION MANIFESTO: "feels like it slightly misses
  the beat". Measured: cuts 34-108 ms (1-3 frames) before the arrival of their sound swell, because
  the edit had dropped a slow drift present in the source. Fix: a picture-only retime of five cuts by
  1-3 frames; 23 of 23 swells then carried a picture event on arrival. The owner's ear outranks the
  summary numbers; measure where he points.
- **Colour lost in a revision.** The owner on the lotus: "a strong regression, it was better before,
  now it looks colourless", after a neutral regrade. Compare every new version with the previous
  one, not only with the reference.
- **Simplified geometry called a match.** A bending band rebuilt as angles, weaker bloom, smaller or
  darker objects than the reference. Write these as deviations, do not round them up to "matches".
- **Letterboxed art.** A 16:9 source left in a strip of the 9:16 canvas with black around it was
  sent back. A square reference worked when its stage sat at y 420-1500 at scale 1 and the background
  fields were rebuilt full height.
- **Flashes.** A source had 34 flashes, up to 7 per second (photosensitivity guidance is at most 3).
  `cuts.json` counts flashes; tell the user before copying a strobe.

## Sound details

- Measure the render's audio against the source with `compare`; the pipeline added 42.7-45 ms.
  Compensate with `data-media-start`, render, measure again.
- The rendered mp4's video stream starts at 0.021 s; the tools measure from the first frame.
- A source with no audio stream gets no soundtrack in the copy.
