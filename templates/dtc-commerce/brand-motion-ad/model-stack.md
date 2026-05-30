# model-stack — brand-motion-ad

The model stack + tooling for the hand-drawn brand bumper, lifted from `workspace/projects/odindoma-motion-001/` and generalized. The default cut is HyperFrames (local, free) plus ONE paid mascot; an optional `seedance-2.0` t2v pass renders a fully-animated alternate cut.

## Tooling + spend (source total ~$1.49)

| Stage | Tool / model | Calls | $ each | Note |
|---|---|---|---|---|
| Site grounding | Playwright (DOM inspect) | — | $0 | Pull real palette + self-hosted webfonts |
| Mascot (the only required paid asset) | `openai/gpt-5.4-image-2` | 1 | ~$0.15-0.20 | Transparent PNG, picture-book line aesthetic |
| Optional alt-cut video | `bytedance/seedance-2.0` | 1 | ~$0.84 / 6s | Fully-animated cut; off-sweet-spot for cartoon (see `prompt-cookbook.md`) |
| Composition (default cut) | HyperFrames `index.html` | — | $0 | Single composition, boil layer + GSAP timeline |
| Render | `ralphy render <id>` | — | $0 | HyperFrames → mp4 |

The HyperFrames cut is the deliverable; the mascot PNG is the single paid input. The seedance pass is optional and additive.

## Mascot generation (the one paid input)

The mascot must read as ONE flat-fill, wobbly-black-outline, picture-book character — no shading, no gradient, no 3D. Prompt skeleton (validated):

> "hand-drawn cute [creature] mascot, [pose: e.g. waving one stick arm], simple silhouette body, two big round white dot eyes (no pupils), thin black stick arms/legs, NO fur texture, NO shading, NO highlights, NO 3D — pure flat solid [fill color] outlined by a thin wobbly hand-drawn black ink stroke. Children's-picture-book line aesthetic. Transparent background. ~800×800."

- **Model:** `gpt-5.4-image-2` holds the flat picture-book line cleanly. (Check `MODELS.md` before the call.)
- **Emotion via pose + eye-marks**, never a literal mouth/nose — same discipline as the mascot sticker pack.
- The PNG gets the same `.boil` parent treatment as the drawn shapes (see `composition.md`).

## Fonts (site-grounded, free)

- **Display / wordmark + keyword:** a chunky rounded display face (source used Bagel Fat One from Google Fonts — closest match to the reference's bubble lettering). Self-host the woff2.
- **Body / slogan + footer:** a friendly variable sans (source used Rubik 800). Self-host the woff2.
- **Pairing rule:** display for the brand-mark beat + the one highlighted keyword; body for the supporting slogan line and footer.

## Palette override discipline

Pull the brand's real palette from its site, then LOCK a working palette for the video. If the brand's primary accent clashes with the natural highlight choice, override it: the source swapped the reference's blue for the brand's lime green across the board, and picked PINK for the keyword because yellow would clash with lime — pink sits across the color wheel and was already in the brand's accent stack. The rule: highlight color comes from across the wheel from the primary, ideally already in the brand stack.

## Why not just generate the whole thing as video?

`seedance-2.0` lineage is tuned for photoreal motion / horror / POV / non-default physics (per the `feedback_vg_model_picks` memory). A hand-drawn picture-book cartoon is OFF its sweet spot — expect drift toward 3D / photoreal on the first roll. The HyperFrames cut is deterministic, free, and on-register; the seedance pass is an optional alternate. If you do fire seedance and it drifts: strengthen the negative cluster, add a pixel style-ref, or accept it as a "seedance interpretation" alt-cut rather than a 1:1 match. See `prompt-cookbook.md`.
