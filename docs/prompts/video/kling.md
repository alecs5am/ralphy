# Kling video prompts

Kling-v3.0-{pro,std,o1} expects the prompt assembled in this **exact** order:

```
Scene: <where + when>.
Character: <subject description, identity tokens>.
Shot: <camera>. Lighting: <light>. Style: <register>.
Motion: <gesture or specific physical action>.
Dialogue: [<Speaker>, <tone>]: "<line>"
Progression: <duration>, <aspect>, no background music, SFX only.
```

### Hard rules

- **Always ban music explicitly.** Kling auto-bakes ambient piano/strings unless told otherwise. Memory: `feedback_kling_no_music_eleven_music_postmix`.
- **`--audio` is EN-only.** For RU / KR / etc, hand voice over to ElevenLabs separately.
- **Bracketed dialogue.** `[<Speaker>, <tone>]: "<line>"` — anything else gets misread.
- **2500-char prompt cap.** Keep each block compact.

---

## Mode 1 — `selfie-talking-head`

**When:** UGC creator monologue, 5–10s, single character, 35mm selfie distance.

**Formula:**
```
Scene: <location>, <time of day>. Character: <persona + identity tokens>.
Shot: selfie 35mm, eye-level, handheld. Lighting: soft window from screen-left.
Style: Kodak Portra 400, naturalistic NOT glossy.
Motion: <gesture>, eyes locked on lens. Dialogue: [<Speaker>, deadpan]: "<line>"
Progression: 5s clip, 9:16, no background music, SFX only.
```

**Sample prompt:**
> Scene: third-wave coffee bar, golden hour. Character: Sasha, 28, freckled barista in a navy apron. Shot: selfie 35mm, eye-level, handheld. Lighting: soft window light from screen-left. Style: Kodak Portra 400, naturalistic NOT glossy. Motion: lean-in toward camera, eyes locked on lens. Dialogue: [Sasha, deadpan]: "I tried it for thirty days". Progression: 5s clip, 9:16, no background music, SFX only.

**Don't:** glamour beauty filter, enlarged eyes, jawline reshape, perfect symmetry.

## Mode 2 — `pov-walking`

**When:** First-person walking shot, environment scrolls past camera, 5–8s.

**Formula:**
```
Scene: <environment>, walking forward. Character: POV — bottom of own jacket visible.
Shot: handheld GoPro-style, low-mounted chest, slight bob. Lighting: ambient natural.
Style: GoPro / iPhone amateur, NOT cinematic.
Motion: steady forward walk, slight side sway. Dialogue: none.
Progression: 6s clip, 9:16, no background music, footsteps + ambient only.
```

**Don't:** smooth gimbal motion (kills the "real walk" feel).

## Mode 3 — `hyper-motion-product-reveal`

**When:** Product enters frame fast, big anticipation beat, 3–4s.

**Formula:**
```
Scene: <minimal backdrop>. Character: hand entering frame from screen-right.
Shot: macro 50mm, locked tripod. Lighting: hard rim light + soft fill.
Style: commercial CGI register, color-graded teal/orange.
Motion: hand-product-reveal — hand pushes <product> into frame from right, holds at center.
Dialogue: none. Progression: 3s clip, 9:16, no background music, whoosh + impact SFX at 0.5s.
```

**Don't:** auto-zoom (breaks the locked-tripod illusion).

## Mode 4 — `jump-cut-meme`

**When:** TikTok meme cuts where character expression flips mid-clip, 2–3s.

**Formula:**
```
Scene: <location>. Character: <persona> mid-action.
Shot: handheld 28mm. Lighting: flat indoor LED.
Style: TikTok native, sharp captions friendly.
Motion: <gesture A> → snap → <gesture B>. Dialogue: [<Speaker>, hyped]: "<one-line punchline>"
Progression: 2.5s clip, 9:16, no background music, sharp cut SFX at midpoint.
```

**Don't:** smooth transition (defeats the meme stinger).

## Mode 5 — `broadcast-realism-square`

**When:** "Caught on TV" trends — interview cam, audience cam, news broadcast. 1:1 square only.

**Formula:**
```
Scene: <event location>, broadcast-cam view. Character: <subject> mid-speech, sweating slightly.
Shot: ENG broadcast 16:9-cropped-to-1:1, eye-level, slight handheld jitter.
Lighting: stadium / studio overhead, mixed color temp.
Style: 1080i broadcast TV, slight motion blur, NOT cinematic.
Motion: <gesture>, head tracks slightly off-camera as if answering an interviewer.
Dialogue: [<Speaker>, neutral]: "<line>"
Progression: 5s clip, 1:1 square, no background music, crowd murmur only.
```

**Don't:** 9:16 portrait (real broadcast cameras shoot 16:9 — portrait reads AI-generated). Memory: `feedback_broadcast_realism_square`.

---

## Empirical craft (validated on real submits)

These are field-tested behaviors of `kwaivgi/kling-v3.0-pro` beyond the per-mode formulas above. They cost re-rolls before they were pinned down; apply them when writing or judging any Kling clip.

### Start frame ≠ end frame (the motion-delta rule)

When you supply BOTH a first-frame and a last-frame anchor (Kling's `first + last` support), the two frames must show a **distinct physical beat** between them — a gesture, head turn, hand raise, expression change, or a camera reveal. If start ≈ end, the model interpolates zero motion and renders a dead static shot.

The discipline: every start/end pair must answer "what physically changes in this 4-5 seconds?" in one concrete sentence. Examples:

- Start: arm at side, mouth closed. End: same stance, right arm raised holding the product, mouth open mid-line.
- Start: subject in a tight medium, neutral. End: camera has dollied out to reveal the absurd context (on a horse, on a log) — the pose holds, the camera does the work.

If you can't name the change, the frames are static and the clip will be too. (Validated when a first attempt used near-identical "standing, half-smile" frames and Kling rendered seconds of stillness.)

**Does NOT apply to:** single-frame-only submits (no last-frame anchor) — there the prompt's `Motion:` line drives the change, not a frame delta; deliberately static "frozen statue / locked-off held pose" beats where stillness is the intent; non-Kling models with their own anchoring semantics.

### `--audio` DOES render speech + SFX (in EN) — and loudness is not a silence check

For English, `--audio` renders the spoken line AND prop SFX described in the prompt. Do NOT use RMS / LRA loudness readings as a "did it render speech?" proxy — UGC selfie audio sits naturally quiet (e.g. around -40 LUFS integrated) and a low reading does not mean silence. Verify by listening, or feed the track to `ralphy ref transcribe` / a Gemini audio-describe pass and check the transcript.

**Does NOT apply to:** non-English VO (accent slip + voice-age drift — render silent + ElevenLabs post-mix, see `feedback_kling_no_ru_audio`); music (always banned in-prompt, post-mixed separately, see `feedback_kling_no_music_eleven_music_postmix`).

### Voice-consistency tag block

Kling holds the rendered voice ~80-90% consistent across clips when the same compact voice-character tag block is repeated **verbatim** in every prompt of a chain. Keep one project-level block and paste it unchanged into each clip. Shape:

```
VOICE TAGS: <age + nationality + gender>, <pitch>, <texture e.g. light vocal fry>,
<mic register e.g. intimate UGC close-mic>, <delivery e.g. deadpan-curious at normal
conversational speed>, no theatrical surprise, no big pauses, no accent.
```

**Does NOT apply to:** non-English VO routed to ElevenLabs (use the ElevenLabs voice clone for continuity instead); single-clip projects with no continuity requirement.

### "CRITICAL DO NOT DO" block beats describing the right action

When Kling misreads a creative instruction (e.g. "tap the jar with your nail" rendered as "press the jar to the cheek like a powder compact"), describing the correct action more vividly does not fix it — Kling drifts toward whichever interpretation is most rendering-natural. The fix is to **explicitly block the wrong interpretation**:

1. State the desired interaction with physical separation ("the jar stays in her LEFT hand at chest level, ~15cm AWAY from the face, NOT touching it").
2. Add a dedicated block enumerating the wrong reading: "CRITICAL DO NOT DO: do NOT bring the jar to the face, do NOT press it against the cheek, do NOT use it like a powder compact."
3. Re-state the contact in physics terms ("the fingernail contacts the JAR; the jar does NOT contact the face").

**Does NOT apply to:** prompts the model already renders correctly (don't pre-emptively bloat every prompt with DO-NOT blocks — reserve for an observed misread); the music ban, which is its own always-on clause.

### Internal hard cuts in one clip (multi-shot single call)

A single Kling clip CAN render multiple distinct shots with internal hard cuts — verified: a 6s clip with explicit "HARD JUMP CUT at 2.0s" and "HARD JUMP CUT at 4.0s" produced three distinct shots with cuts within ~0.2s of the requested times. This means a multi-angle UGC beat can be one Kling call instead of N chained clips. Trigger phrasing that worked: "NOT one take", "THREE shots with TWO HARD JUMP CUTS at X.Xs and Y.Ys", "No crossfade, no blur transition", "abrupt different shot".

**Does NOT apply to:** beats that need non-default motion physics inside a shot (frozen statue, instant teleport-state, hyper-motion) — split those out to a `bytedance/seedance-2.0` clip per `feedback_vg_model_picks`; soft/crossfade transitions (compose those in HyperFrames, not in the model).

### First-frame anchor is only honored at t=0

A `--first-frame` anchor pins composition only at the very start; by ~1.5s Kling freely re-imagines framing. Don't rely on the anchor alone to hold a composition across the whole clip — restate the framing intent in the prompt's `Shot:` line, and for "wide" wording inside a 9:16 container, anchor with a portrait first-frame AND use explicit vertical wording (the anchor overrides the model's landscape bias). Also note: typography on a product that rotates/tilts more than ~5 degrees smudges — keep the product near-static if a label/wordmark must stay legible.

**Does NOT apply to:** clips short enough (under ~1.5s) that re-imagination has no time to set in; cases where mid-clip composition drift is acceptable at mobile playback size.
