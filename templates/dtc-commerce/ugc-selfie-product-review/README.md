# UGC Selfie Product Review

> Intimate handheld 9:16 selfie review of one consumer product. Single influencer-persona in their own room. Identity-lock via two master shots passed as `--ref` on every gen is the whole template.

**Category**: `dtc-commerce`
**Kind**: `vibe-style`
**Source project**: `glitter-cream-001` (Fluttershy holographic glitter cream, 17.2s shipped, $13.79 spent, user-rated 6.5-7/10)

## What this template gives you

- A 5-step workflow (research -> storyboard -> lock refs -> first-frames -> kling) that landed a publishable UGC clip in ~17s of finished video for $13.79 — and would land $6-8 with the discipline below.
- A prompt cookbook with 5 stages (product master / persona master / first-frames / kling video / ElevenLabs music) using `{{slot}}` placeholders.
- A model stack with rationale: `openai/gpt-5.4-image-2` for label fidelity, `google/gemini-3-pro-image-preview` for face-and-room consistency, `kwaivgi/kling-v3.0-pro --audio` for English UGC video, `elevenlabs/music_v1` for the bg bed.
- 4 hook patterns (0-2s opens) validated in the source project + 3 fragments you should paste verbatim into every kling prompt (voice-tag, music-ban, real-girl-skin).
- 2 worked examples (Fluttershy glitter jar = shipped, Northstar Co. toner = hypothetical port).

## Cost ballpark

- **Disciplined run** (locked refs upfront, no A/B, single retry per clip): **$6-8** total.
- **First-time / exploratory** (one A/B axis, some master regens): **$10-14** total.
- **Heavy retry / multiple action-drift fights**: **$15-20** total.

Per-stage breakdown in `model-stack.md`.

## The single most important rule

**Lock product + persona super-original masters BEFORE any scene gen, and pass BOTH as `--ref` on EVERY downstream `ralphy generate image|video` for the rest of the project.**

Without this, identity drifts between scenes — same brand drifts pink-script-to-sticker, same face drifts AI-plastic, same room drifts from bedroom to studio. Source-project cost of forgetting mid-session: $0.70 of regenerated masters + $1.61 of regenerated scenes.

The other rules (kling honors HARD JUMP CUTs, music must be banned in-prompt, prompts cap at 2300 chars, geometry stays >=30cm from face) are all derived from real iteration cost. See `TEMPLATE.md` for the full set.

## How to consume this template

```bash
ralphy template use ugc-selfie-product-review \
  --project <new-project-id> \
  --brief "<one-line brief>"
```

This scaffolds `workspace/projects/<new-project-id>/` with the empty subdirs + a `TEMPLATE_ORIGIN.md` pointing back here. Then:

1. Fill `{{brand_name}}`, `{{product_name}}`, `{{product_type}}`, `{{influencer_persona}}`, `{{location_master_plate}}`, `{{target_language}}` from your brief.
2. Get user-supplied product reference image + persona reference selfie (REQUIRED — AGENTS.md hard rule #3).
3. Generate product master + persona master, get user lock.
4. From here, every gen passes both locked masters as `--ref`.
5. Follow the 5-stage workflow in `TEMPLATE.md`.

## Files in this bundle

| File | Purpose |
|---|---|
| `template.json` | Metadata + slots + asset map (consumed by `ralphy template list / show / use / suggest`) |
| `TEMPLATE.md` | Vibe + key rules + workflow + required inputs + anti-patterns + beat structure |
| `prompt-cookbook.md` | Per-stage prompts with `{{slot}}` placeholders + fragments to paste verbatim |
| `model-stack.md` | Model picks + rationale + cost-per-stage + what we tried and dropped |
| `hooks.md` | 4 hook patterns (0-2s opens) with validation status |
| `examples.md` | 2 worked examples: Fluttershy glitter cream (shipped) + Northstar toner (hypothetical port) |
| `README.md` | This file |
| `assets/example-*.png` | Reference example images from `glitter-cream-001`. **Reference only — do not pass as `--ref` for a different brand. Generate your own masters.** |

## Caveats

- **Identity-lock is non-negotiable.** This template's entire reuse value is the discipline. A `ralphy template use` that skips the master-lock phase will produce drifty UGC.
- **Geometry rule is non-negotiable.** Product stays >=30cm from face. Source project paid $2.24 to learn this.
- **Russian / non-English target**: kling `--audio` accent-drifts (memory: `feedback_kling_no_ru_audio`). Switch to kling audio-off + ElevenLabs `eleven_multilingual_v2` post-hoc.
- **Composition is hand-authored Remotion per-project** (~20 lines: `<Sequence>` x clip count + one `<Audio volume={0.18}>` overlay). This is `vibe-style`, not `vibe-reference` — there is no generic composition wiring.
