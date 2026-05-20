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
