# Broadcast Caught-On-TV (Square)

> "Looks like he got caught on the audience cam." Single-clip trend recreation where the user's own face appears, anchored on their selfie, inside what reads as a real live sports / venue broadcast. Square 1:1 framing is the load-bearing aesthetic decision — it's what makes it look real.

## Vibe

A real broadcast camera caught an ordinary spectator mid-reaction during a live event. Slightly soft compression, faint sweat sheen, flyaway hairs, on-screen broadcast graphics, ambient crowd, distant announcer in the venue language. The joke / hook is the moment of recognition — *that's the poster, on TV*.

Built from a single 15s Kling clip with native ambient audio. No multi-scene cut, no music bed, no studio VO. The format is the format precisely because there's nothing produced on top of it.

## Required inputs

| Slot | Description | Example value from source project |
|---|---|---|
| user selfie / character ref | A clean front-facing photo of the subject. Passed via `--ref` once at the image stage. | A 59yo male user's selfie (passthrough only — never viewed by the agent) |
| `{{league_or_sport}}` | The live event the broadcast is from. Drives stadium / venue dressing + announcer language. | `KBO baseball` |
| `{{moment_archetype}}` | The kind of caught-on-TV moment. Drives the beat-by-beat motion. | `audience-cam reaction beat` |
| `{{broadcast_channel}}` | The network whose on-screen graphics package the still should imitate. | `SPOTV / KBO live broadcast` |
| `{{target_language_for_announcer}}` | Drives the ambient announcer voice Kling synthesizes. | `Korean` |

## Key rules (from kbo-broadcast-001 postmortem)

1. **Render the anchor still SQUARE, not 9:16. Real broadcast cameras shoot 16:9 — strict portrait feels AI-generated.** Square 1:1 (1024x1024 from `openai/gpt-5.4-image-2`) "splits the difference" between landscape broadcast and vertical-feed and reads as a phone capture of a live TV screen. Verified post-hoc: the user picked the 960x960 square Kling output over the technically-correct 716x1284 9:16 version as "лучше и реалистичнее". Crop / pad to platform-strict 9:16 only at final delivery, never at origin.

2. **`gpt-5.4-image-2` silently rounds `--size 1080x1920` to 1024² (square), and Kling honors the input first-frame aspect over `--aspect-ratio 9:16`.** This is a feature for this template, not a bug — let it happen. If you need strict 9:16 from origin, switch to `google/gemini-3-pro-image-preview`, but expect a less-realistic broadcast feel.

3. **The `--ref` selfie does the identity work. Tame the prompt body.** Heavy phrases like "exact same identity, same face shape, same eyes" combined with "real broadcast capture" appears to trigger gemini's deepfake heuristics → skeleton-null responses. Describe the SCENE in the prompt, not the identity. The single `--ref` image is sufficient anchor for both gpt-5.4 still and the downstream Kling i2v (no need to pass selfie a second time to Kling).

4. **`kwaivgi/kling-v3.0-pro --audio` IS the correct call for ambient diegetic sound** (stadium crowd, distant announcer, bat crack, vendor calls) — despite the CLI help text saying "Veo 3 only". The "EN-only" rule applies to spoken VO, not to ambient. Explicitly negate `no music, no studio voiceover` in the prompt or Kling will add a soundtrack.

5. **Pronoun-swap the trend template before submit.** Many pasted caught-on-TV prompts say "she blinks, she smiles, she notices the camera". Kling will try to honor those pronouns even with a male `--first-frame`, softening features. Scan every pasted template for `she/her/hers` and swap to match the user's identity.

6. **Beat-by-beat timeline anchors Kling's pacing across 15s.** Without `0-3s ... 3-6s ... 6-9s ...` markers, Kling compresses motion into the first 5s and the remaining 10s is a static hold. Always write the beats explicitly.

7. **One slot = one artifact. New duration or audio flag = new slot.** `scene-01-vid` (5s, no audio) and `scene-01-vid-15s-audio` are different artifacts. The CLI does not yet enforce auto-versioning; reusing a slot silently overwrites the previous file. Cost the source project a $0.70 5s clip that's now unrecoverable.

## Workflow

For a fresh single-clip trend recreation, run in order:

1. **Reference intake (2 min)**
   - Save the user's selfie path.
   - `ralphy project log-asset <id> --kind photo --purpose character-ref --source <selfie> --note "passthrough only"`

2. **Model name lookup (1 min)**
   - Read `MODELS.md` image section. "gpt image 2" → `openai/gpt-5.4-image-2`. "nano-banana(-pro)" → `google/gemini-3-pro-image-preview`.
   - Default to `openai/gpt-5.4-image-2` for this template — its 1024² square output is the desired aesthetic.

3. **Identity-anchor still (~3 min)**
   - `ralphy generate image --slot scene-01-still --model openai/gpt-5.4-image-2 --ref <selfie> --prompt "<scene-only description, NEUTRAL identity language>"`
   - Do NOT force `--size 1080x1920` — let gpt-5.4 produce its natural 1024² bucket.
   - If you must have strict 9:16 from origin (rare for this template), switch to `gemini-3-pro-image-preview` and retry up to 5× on null-skeleton responses (transient).

4. **Pronoun pass on the Kling prompt (1 min)**
   - Find every `she / her / hers` in the pasted trend template, swap to match subject.

5. **Video i2v (~3 min for 15s)**
   - `ralphy generate video --slot scene-01-vid --model kwaivgi/kling-v3.0-pro --duration 15 --audio --first-frame <still>.png --prompt "<beat-by-beat with 0-3s / 3-6s markers, no music, no studio VO>"`
   - Kling will honor the square first-frame over any `--aspect-ratio` flag — let it.

6. **Verify (1 min)**
   - `ffprobe` to confirm geometry + audio track.
   - Eyeball identity + motion. If a beat is missing motion, regen the video with the same first-frame but tighter beat language — do NOT regen the still.

7. **New variant?**
   - Pick a new slot (`scene-02-vid` or `scene-01-vid-takeB`). Never reuse a slot for a different duration / audio / model combo.

## Anti-patterns (DO NOT)

- **DO NOT force `--aspect-ratio 9:16` on the image stage.** Square is the aesthetic. Strict portrait at origin breaks the broadcast-realism illusion.
- **DO NOT regen "scene-01-vid" with a new duration or audio flag.** Pick a new slot — the CLI silently overwrites and the lost file is unrecoverable (workspace is gitignored).
- **DO NOT pass identity-preservation language in the prompt body.** The `--ref` does it. Heavy "exact same identity" phrases push gemini into skeleton-null responses + don't help gpt-5.4.
- **DO NOT pass the selfie as a second ref to Kling.** The still is already the identity anchor; multi-ref on i2v adds nothing.
- **DO NOT post the raw clip with strict-9:16 letterbox bars.** If platform-strict portrait is required, crop / pad at composition time and accept some loss of broadcast realism — never re-render with `--aspect-ratio 9:16` from origin.
- **DO NOT skip the pronoun pass.** Subtle feminization / masculinization of the subject is the most common identity drift in this format.
- **DO NOT add a music bed.** The trend depends on diegetic audio reading as a real broadcast. A music track over the top instantly reveals it as AI-produced.
- **DO NOT name fictional broadcast channels.** SPOTV, ESPN, Sky Sports, BBC, TV Tokyo are real and have visual conventions Kling can reproduce. Invented brands ("SPORTS-X Network") read fake.

## Beat structure (the canonical 15s)

| Window | Beat | Motion |
|---|---|---|
| 0–3s | Watching | Subject is engaged with the live event, unaware of the camera. Blinks, slight head tilt, soft natural expression. |
| 3–6s | Notices camera | Eye flicks toward lens, brief eye contact, small amused / surprised micro-reaction. |
| 6–9s | Beat-of-life | Sip from a beer cup, glance back at the field, scratch nose, adjust posture — small grounded human gesture. |
| 9–12s | Laugh / clap | Light laugh at the play, soft clap with the surrounding crowd, eyes back to the field. |
| 12–15s | Settles back | Slight exhale, returns to relaxed watching. Ambient continues. No payoff cut — the format is the ordinariness. |

This is the canonical pattern. Swap individual beats per `{{moment_archetype}}` — for kiss-cam, beat 2 becomes "realizes they're on the jumbotron"; for red-carpet, beat 3 becomes a flash-pop reaction; for news vox-pop, the whole arc compresses to one-shot reaction-then-pivot.
