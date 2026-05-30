# brand-motion-ad

A short hand-drawn picture-book brand bumper (~6s, 4:3 or 1:1) in the naive-cartoon / felt-tip register, built in HyperFrames with ONE generated mascot. Source: `workspace/projects/odindoma-motion-001/` (a 6.0s 4:3 brand bumper for a content brand, final `render/final.mp4`).

**Kind:** vibe-style (the composition is brand-specific; hand-author `index.html` per `composition.md`, with the brand's site-grounded palette + fonts + the one generated mascot).
**Category:** dtc-commerce (a brand-facing bumper driving recognition).
**Format:** motion-design.
**Aspect:** 4:3 1440×1080 (matches the reference) or 1:1.
**Length:** 6-8s (source: 6.0s).
**Audio:** silent in v1; add a 6s ElevenLabs line + music bed in a v2 pass if wanted.

## How to use

```bash
ralphy template use brand-motion-ad \
  --project <new-project-id> \
  --brief "<brand + site URL + slogan + product window shape>"
```

Then run the build in `composition.md`. The render path is `ralphy render <id>` (HyperFrames `index.html`).

## Files

| File | What's in it |
|---|---|
| `composition.md` | The beat structure, the boil-layer technique, elastic pop-ins, the single-sustained-mascot rule, and the build workflow. Read this first. |
| `model-stack.md` | The model stack (the ONE paid mascot + optional seedance alt-cut), fonts, and the palette-override discipline. |
| `prompt-cookbook.md` | Generalized prompts for the mascot still and the optional seedance fully-animated alt-cut. |

## Heavy assets

No assets are committed here — every remix supplies its OWN brand (palette + fonts from the site) and generates its OWN mascot. The mascot is the single paid input (~$0.15-0.20 on `gpt-5.4-image-2`). If a brand's mascot proves reusable across multiple bumpers, it lives in `ralphy-assets/pool/<brand-slug>/`.

## Cost ballpark

**~$1.49** in the source (the mascot still + an optional seedance pass + a couple of regens). The default HyperFrames cut needs only the one mascot PNG; skipping the seedance alt-cut brings it to ~$0.15-0.20.

## Key rules (each cost iterations in the source project)

1. **Site-ground the palette + webfonts BEFORE authoring.** Override the reference accent to the brand's own; pick the highlight color from ACROSS the color wheel so it never clashes (source: blue→lime green, keyword→pink, not yellow).
2. **The boil layer is the whole register.** A 1-2px frame-by-frame jitter (`steps(1) infinite`) on every drawn shape sells the cel-animation feel. But do NOT boil a wordmark whose letters already spring — the jitter on top makes it visibly judder.
3. **Elastic pop-ins everywhere, never linear fades.** `scale 0 → 1.08 → 1` (`elastic.out` / `back.out`) on every entrance. A linear fade reads as PowerPoint.
4. **ONE sustained mascot, no cuts.** The drawn character stays on screen the whole second half with continuous micro-motion. This is the picture-book anchor.
5. **The mascot is the only required paid asset.** Generate it on `gpt-5.4-image-2`, flat picture-book line, emotion via pose + eye-marks (no mouth/nose). The full video CAN be a seedance pass, but cartoon is off seedance's sweet spot — keep the HyperFrames cut as the safe default.
6. **The wipe-shrink is an `inset()` shape morph, NOT a circle iris.** The accent flood the viewer just watched paint shrinks back into the product-window shape — the reveal is "that flood WAS the window".

## Do not copy literally

The source brand's name, palette, mascot, slogan, and product window are one-off. Reuse the METHOD: site-grounded palette + fonts, accent override with across-the-wheel highlight, single composition with opacity-gated beats, the boil layer on every drawn shape, elastic pop-ins, the single sustained mascot, the marker-wipe → `inset()` shape-morph reveal, and the one generated mascot still.
