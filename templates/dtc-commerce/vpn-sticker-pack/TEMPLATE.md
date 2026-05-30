# Mascot Sticker Pack (vpn-sticker-pack)

A full messaging sticker pack (~32 die-cut stickers) built around **one featureless brand mascot**, reproducing recognizable chat memes through pose and prop. Derived from `free-air-vpn-stickerpack` (a translucent pale-blue jelly mascot, 32 Telegram stickers, two deliverable sets).

- **Kind:** vibe-style — the recipe IS the deliverable. No HyperFrames composition; the output is the transparent PNG set.
- **Category:** dtc-commerce (a consumer product / brand mascot pack).
- **Format:** sticker-pack.
- **Count:** ~32 stickers. **Output:** transparent PNG, 512px long side, two sets (white-die-cut-outline + clean-silhouette).

## How to use

```bash
ralphy template use vpn-sticker-pack --project <new-project-id> --brief "<your mascot + pack vibe>"
```

There is no render/compose stage — the stickers ARE the deliverable. Run the pipeline in `composition.md`.

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `mascot_desc` | yes | One-sentence physical description of the mascot. |
| `mascot_master` | yes | Absolute path to the ONE neutral identity-anchor PNG (passed as `--ref` on every gen). |
| `look_register` | yes | Render look (e.g. "soft 3D clay Blender figurine, glossy softbox light, gentle AO"). |
| `bg_hex` | yes | Flat keying bg. `#00b140` chroma green default; `#dcd7cf` grey only for an outlined set. |
| `eye_alphabet` | no | Expression vocabulary as eye-marks. |
| `sticker_count` | no | Default 32. |
| `text_slot` | no | The one sticker needing a crisp letter → route to gpt-5.4-image-2. |

## Files

| File | What's in it |
|---|---|
| `composition.md` | Pipeline, meme-pose vocabulary, the cutout/sizing recipe. Read this first. |
| `prompt-cookbook.md` | Base sticker prompt, no-outline i2i conversion, per-meme pose clauses — all with `{{slots}}`. |
| `model-stack.md` | Model picks per stage, cost ballpark, what to avoid. |

## Cost ballpark

**~$6.5** at ~1.2× minimum-viable (gemini at $0.15/image; 32 stickers + a small look-test + a few re-rolls). The source spent ~$12.20 — ~$5.10 was a full no-outline re-gen pass eliminated by generating clean-on-green from the start (rule 1).

## Key rules (each cost money or time in the source project)

1. **Decide outline + transparency BEFORE the first gen.** Generate on flat chroma-green WITHOUT a baked outline by default. A baked outline cannot be cleanly stripped — that miss forced a full re-gen (~$5.10).
2. **Key the BACKGROUND, never segment the SUBJECT.** u2net hugs the body and cuts the outline off. Flood-fill the flat bg color from the image borders — keeps the outline, same-color interior props, and disconnected islands.
3. **Soft alpha, never a binary mask** (staircase edges). Greenness ramp OR `GaussianBlur(0.8)` feather.
4. **Flood-fill connectivity beats a per-pixel greenness ramp** — a ramp leaves a haze that inflates the crop box.
5. **Crop to the solid bbox + scale long side to exactly 512. Do NOT pad to a 512² square** (subject looks tiny).
6. **Lock the mascot with a single neutral master shot as `--ref` on every gen.** gemini-3-pro-image holds one character across 30+ poses; reserve gpt-5.4-image-2 for the one text sticker only.
7. **A featureless mascot emotes through eye-marks + pose + one prop.** Meme legibility comes from silhouette, not face.
8. **Transient errors are not content filters — retry the slot** (`certificate verification error`, empty `images[0]`); both clear at $0.
9. **gemini ignores a removal instruction ~6% of the time** — spot-check the requested edit, escalate the negative.

## Do not copy literally

The source mascot (translucent pale-blue jelly) is one-off. Reuse the METHOD: single-ref identity lock, eye-mark emotion alphabet, meme-as-pose, generate-clean-on-green, flood-fill cutout, 512 long-side sizing. Supply your own mascot.
