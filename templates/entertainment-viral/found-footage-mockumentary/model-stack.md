# Model Stack — found-footage-mockumentary

Reconstructed from `workspace/projects/occult-mockumentary-001/logs/generations.jsonl` (62 entries). Postmortem absent — no `04-models-and-cost.md` to cross-reference. The cost-rollup below is direct from the gen-log; the "what worked / what we tried and dropped" rationale is reconstructed from gen-log `note` fields and asset-manifest filenames.

## Stage defaults

### Image masters + per-clip first-frames — `google/gemini-3-pro-image-preview`

- **Endpoint:** `google/gemini-3-pro-image-preview` via OpenRouter
- **Cost:** $0.15 per image (flat across all 17 image gens in the source project)
- **What it's used for:** every master shot, every per-clip first-frame anchor, every variant frame
- **Why it works:** handles user-supplied creature reference PNGs as `--ref` cleanly; produces consistent Hi8 / cinema register depending on prompt wording; honors negative-prompt blocks well
- **Plan-of-record:** 1 creature master + 1 cult-circle master + 1 grinning-face master + 1 operator-hand master + 5-6 per-clip first-frames = 8-10 images = ~$1.20-$1.50 per project

### Video clips (i2v) — `bytedance/seedance-2.0` IS THE DEFAULT HERE

**Critical:** for this template, `seedance-2.0` is the right pick for non-default physics motion (per cross-project memory `feedback_vg_model_picks.md`). Kling animates the cultist body-rotation turn even when explicitly told not to; seedance honors the "instant teleport-state, zero rotation" instruction. Kling also produced "weird foot-in-camera walk" on the approach beat — seedance fixed it on regen.

- **Endpoint:** `bytedance/seedance-2.0` via OpenRouter
- **Cost:** $0.14/s; 5s clip = $0.70; longer clips scale linearly
- **Use seedance for:** any clip whose action note contains "instant", "frozen", "static", "teleport", "jump-scare", "lunge", or any beat where cultists must NOT move while the operator does. Also the monster reveal (lunge or stalking-approach), the photo-flash turn, the retreat (cultists stay frozen at original position while the camera moves backward).
- **Use seedance for:** approach POV walking — even though that's default physics, kling produced foot-in-camera artifacts in the source project. Seedance is the safer pick for first-person POV walking.

### Video clips (i2v fallback) — `kwaivgi/kling-v3.0-pro`

- **Endpoint:** `kwaivgi/kling-v3.0-pro` via OpenRouter
- **Cost:** $0.14/s
- **Use kling for:** clips where the motion IS default-physics AND you've validated seedance doesn't outperform it for the specific beat. The source project tried kling for everything first (7 clips, ~$9.52) before settling on seedance for the v2/v3 regens.
- **DO NOT use kling for:** the photo-flash turn, the cultist-retreat scene, the jump-scare lunge. Kling will animate body rotation, breath, sway — all of which break this template's "stillness is the horror" rule.
- **DO NOT use kling `--audio` for non-English** (per memory `feedback_kling_no_ru_audio.md`) — produces accent slip and voice-age drift. This template ships no-VO so the question only arises if you deviate from the default.

### SFX + ambient — ElevenLabs Music endpoint, banned-music

- **Endpoint:** ElevenLabs Music API (via `ralphy generate music`)
- **Cost:** $0 in the source project gen-log (free tier covered) — current ElevenLabs pricing applies
- **Use for:** all 5 audio elements (horror ambient bed, wet inhale, wet crunch + multi-foot step, camera-drop thud + VHS static, distant chant whisper). See `prompt-cookbook.md → Stage 3` for verbatim prompts.
- **Critical:** every SFX prompt MUST include "NO music, NO melody, NO rhythm, NO percussion, NO singing" or equivalent. Without the ban, ElevenLabs's classifier routes the request through its music synthesis and returns a melody that doesn't fit. With the ban, returns clean sound-design audio every time.

### Render — Remotion (`remotion-render`)

- **Cost:** $0 (local compute)
- **Use:** final composition with VHS overlay shader for Act-1 clips, clean cinema for Act-2 reveal, 3 lower-third captions, persistent REC-dot HUD, `SIGNAL LOST` end card. Render with `--loudnorm` because the SFX layering produces uneven peaks otherwise.

## Cost ballpark per project

Based on the source project (`occult-mockumentary-001`), which iterated heavily through 6 render versions (`v1-ambient-only.mp4` through `v6-cont-fixed-boxed-caps.mp4`) and burned ~$27.42 in model calls:

| Stage | Source project actual | Optimized ballpark for a clean pass |
|---|---|---|
| Image masters + first-frames | 17 × $0.15 = $2.55 | 8-10 × $0.15 = $1.20-$1.50 |
| Video clips (seedance) | 8 × $0.70 = $5.60 | 6 × $0.70 = $4.20 |
| Video clips (kling, dropped) | 7 × avg $1.36 = $9.52 | $0 (skip kling phase entirely) |
| Video re-rolls (kling v2, dropped) | 2 × $2.10 = $4.20 | $0 (use seedance from clip 1) |
| Music / SFX (ElevenLabs) | 5 × $0 = $0 (free tier) | $0-$5 depending on tier |
| Render | $0 | $0 |
| **Total** | **~$27.42** | **~$5-$10** |

Most of the source project's spend was the kling phase + re-rolls. A clean pass starting with seedance-2.0 from the first clip avoids that.

## What worked

- **`gemini-3-pro-image-preview` with 2-3 user-supplied creature reference PNGs passed as `--ref`** produced consistent Cronenberg / Silent Hill body-horror anatomy across all monster renders. The reference PNGs are the single biggest determinant of subject fidelity.
- **`seedance-2.0` with explicit "INSTANT TELEPORT-STATE, NOT animate" + "ZERO body rotation, ZERO torso-twist"** delivered the photo-flash turn cleanly. The trick is double-redundancy in the prompt — both the "frozen statue" framing AND the "do not animate this beat" critical-do-not-do block.
- **Sequential first-frame chaining** (last frame of clip N = first frame of clip N+1) maintained cross-clip continuity for the retreat → sound → reveal sequence. Generate the next first-frame from the actual last frame of the previous render, not from a fresh prompt.
- **Banning music in the SFX prompts** ("NO music, NO melody, NO rhythm, NO percussion, NO singing") routed ElevenLabs to its sound-design path and returned pure SFX every time.

## What we tried and dropped

- **`kling-v3.0-pro` for the photo-flash turn** — kling animated a slow body rotation as the cultists "turned around", which completely broke the uncanny "instant teleport-state" beat. Switched to seedance and got the instant-cut behavior immediately.
- **`kling-v3.0-pro` for the cultist-retreat scene** — kling let the cultists drift / sway in the distance as the operator retreated, which broke the "they are frozen statues" rule. Seedance held them perfectly still.
- **`kling-v3.0-pro` for the monster jump-scare lunge** — kling's motion model is too smooth / too cinematic for a sudden violent lunge; the result read as a graceful walk rather than a predator strike. Seedance produced the explosive forward motion.
- **`kling-v3.0-pro` 15s multi-cut clips with two-anchor first-frame + last-frame** — kling errored when given both first and last frame anchors (gen-log `note`: "kling errored on 2-anchor"). Falling back to first-frame-only at higher cost, then ultimately switching to seedance.
- **Heavy VHS-glitch baked into the i2v prompt** — kling produced cartoon-ABC artifacts in the early Clip C attempts ("v1 glitched into cartoon ABC"). Solution: keep the i2v clip clean Hi8 register, apply the VHS overlay shader in Remotion post.

## Open question for a future postmortem

This template ships without a `/postmortem` against `occult-mockumentary-001`. If you finish a project using this template, run `/postmortem` and feed the lessons back into this file — specifically:

- Is seedance still the right default in late-2026? (Model catalog moves fast — check `MODELS.md` before every video gen.)
- Has the kling team fixed body-rotation honoring "do not animate" prompts?
- Are there cheaper image models for the first-frame anchors that don't break the reference fidelity?
