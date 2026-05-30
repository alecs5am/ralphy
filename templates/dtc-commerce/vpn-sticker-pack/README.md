# vpn-sticker-pack

A full messaging sticker pack (~32 die-cut stickers) built around **one featureless brand mascot**, reproducing recognizable chat memes through pose and prop. Source: `workspace/projects/free-air-vpn-stickerpack/` (a translucent pale-blue jelly mascot, 32 Telegram stickers, two deliverable sets).

**Kind:** vibe-style (the recipe is the deliverable — there is no HyperFrames composition; the output is the PNG set itself).
**Category:** dtc-commerce (a consumer product / brand mascot pack).
**Format:** sticker-pack.
**Count:** ~32 stickers (source: 32).
**Output:** transparent PNG, 512px long side, two sets (white-die-cut-outline + clean-silhouette).

## How to use

```bash
ralphy template use vpn-sticker-pack \
  --project <new-project-id> \
  --brief "<your mascot + pack vibe>"
```

Then run the pipeline below. There is no render/compose stage — the stickers ARE the deliverable.

## Files

| File | What's in it |
|---|---|
| `composition.md` | The pipeline, the meme-pose vocabulary, and the cutout/sizing recipe. Read this first. |
| `prompt-cookbook.md` | The base sticker prompt, the no-outline i2i conversion prompt, and per-meme pose clauses — all with `{{slots}}`. |
| `model-stack.md` | Model picks per stage + cost ballpark + what to avoid. |

## Heavy assets

The source mascot master shots (the 15 `freeair-neutral`-class identity anchors + 20 style refs) are **not** committed here — they are mascot-specific and not reusable for a different brand. Each remix supplies its own neutral master shot and passes it as `--ref` on every generation. A reusable mascot identity set, if one proves out, lives in `ralphy-assets/pool/<mascot-slug>/`.

## Cost ballpark

**~$6.5** at ~1.2× minimum-viable (gemini at $0.15/image; 32 stickers + a small look-test + a few re-rolls). The source project spent **~$12.20** — ~$5.10 of that was a full no-outline re-gen pass that a single intake decision (generate on green, no outline, from the start) would have eliminated. Follow rule 1 below and one render pass serves both deliverables.

## Key rules (each cost money or time in the source project)

1. **Decide outline + transparency BEFORE the first gen.** Generate on flat chroma-green WITHOUT a baked outline by default. A white outline baked into pixels cannot be cleanly stripped later — that miss forced a full 32-image re-gen (~$5.10).
2. **Key the BACKGROUND, never segment the SUBJECT.** u2net salient-object segmentation hugs the body and cuts the white outline off. Flood-fill the known flat background color from the image borders — it keeps the outline, same-color interior props, and disconnected islands (a flying cup).
3. **Soft alpha, never a binary mask.** A hard mask gives staircase edges. Preserve the anti-aliased edge with a greenness ramp OR a `GaussianBlur(0.8)` feather.
4. **Flood-fill connectivity beats a per-pixel greenness ramp.** A ramp alone leaves a faint low-alpha green haze that inflates the crop box and makes the subject sit small. Connectivity from the borders removes the whole background incl. haze.
5. **Crop to the solid bbox + scale long side to exactly 512. Do NOT pad to a 512² square.** Padding leaves the subject tiny in the messenger.
6. **Lock the mascot with a single neutral master shot as `--ref` on every generation.** gemini-3-pro-image holds one character across 30+ poses this way. Reserve gpt-5.4-image-2 only for the one text-bearing sticker (crisp letterforms).
7. **A featureless mascot emotes through eye-marks + pose + one prop.** Read the mascot's own "emotion alphabet" (`^^ / ·· / —— / ×× / @@ / heart / wink / closed`). Generic "happy/sad" is forgettable; meme legibility comes from silhouette (table-flip, this-is-fine, sigma, 4-arms-busy).
8. **Transient errors are not content filters — just retry the slot.** `unknown certificate verification error` is a network blip; gemini `no images[0]` with reasoning text present is a flaky soft-refusal. Both clear on retry at $0. Don't redesign the prompt on the first transient.
9. **gemini will silently ignore a removal instruction ~6% of the time.** Always spot-check the specific edit you asked an i2i pass to make; escalate with an emphatic negative ("green must touch the body directly, NO halo/glow").
