---
goal: Music bed that builds tension over 3-6 seconds before resolving to silence at the cut.
applies_to: [music]
tags: [music, tension, build, uptempo, cliffhanger]
models_known_good: [elevenlabs-music]
models_known_bad: []
references: []
---

# Music — tension build uptempo

Rising-energy bed used under cliffhanger / reveal setups. Resolves into silence (or a stinger) right before the cut.

## Bad

> "Tense electronic music."

**Why it fails:** Vague genre tag; ElevenLabs Music returns generic ambient pads.

## OK

> "Building tense electronic music at 100 BPM with a kick drum."

**Why it's just OK:** Specified tempo, but no shape (linear vs. exponential build) and no resolution beat.

## Ideal

> Deep sub-bass drone, rising LP filter sweep over 4 seconds, 100 BPM, sparse rim clicks at 16th-note intervals, climbing two-note synth lead, ends on a held suspended chord with no resolution.

**Why it works:** Specific instrumentation, named filter behavior, sparse percussion that won't fight the VO, explicit non-resolution that lets the cut land hard.

## Notes for the implementer

- Loudness budget: −22 to −26 LUFS under VO; −16 to −18 LUFS in silent intervals.
- Duck under VO with `ralphy editor mix`.
- NEVER reference real artists / producers / songs — ElevenLabs ToS blocks the call. See `[[feedback_elevenlabs_music_no_artist_names]]`.
