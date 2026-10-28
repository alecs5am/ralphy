# Editor: extending a stylized clip

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

### Extending a stylized clip (i2v last-frame anchor + full 15s blocks)

When the user asks to "extend" / lengthen an existing stylized clip (toon, painterly, Spider-Verse / Arcane register), don't generate a fresh disconnected clip — **anchor a new i2v clip from the last frame of the existing one** so the join is seamless:

1. Extract the final frame: `ralphy video extract-segment` (or an `ffmpeg -sseof` tail-frame grab via a `ralphy video` recipe) of the last ~0.15s → one PNG.
2. Feed that PNG as the `--first-frame` of a new `ralphy generate video` i2v call on `bytedance/seedance-2.0`. The new clip starts on the real last frame, so the cut is invisible. (Stylized/painterly anchors don't trip seedance's photoreal-human privacy filter — that filter only fires on photoreal human faces, see `feedback_seedance_rejects_realistic_people`.)
3. Default the extension to a **full 15s block, not 5s.** Short extensions feel rushed and lose dynamics; a 15s block has room for a real beat (e.g. solo → camera orbit revealing the crowd → finale) and the stylized register comes through stronger on action-heavy long blocks than on static wides. Emphasize a moving camera (orbit / crane) for dynamics. Keep the SUBJECT / STYLE / AUDIO-POLICY prompt blocks verbatim across blocks.
4. `ralphy video concat` the blocks, regenerate a music bed sized to the FULL new length with the climax aligned to the finale, then `ralphy audio sidechain` (duck music under VO) and copy to `render/final.mp4`.

**Does NOT apply to:** photoreal-human clips (seedance rejects the anchor — extend via `kwaivgi/kling-v3.0-pro` instead); slow static / dialogue-driven beats where a 5s extension is the right length; cases where the new beat is a hard scene change rather than a continuation (then it's a new scene, not an extend, and the last-frame anchor is unnecessary).
