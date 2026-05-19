# japanese-hypermotion-product-ad

**Kind:** `vibe-style` · **Category:** `cinematic-narrative` · **Format:** 15s · 9:16 · 30fps · music+SFX only

15-second Japanese hyperpop product ad. 8 hard-cut beats at ~1.9s avg over a pink-and-cyan tile-grid 3D stage, drum-fill stings on every cut, anime chibi mascots running on the product, ends on a katakana logo + slogan slam.

## Files

| File | What it covers |
|---|---|
| [`TEMPLATE.md`](./TEMPLATE.md) | Vibe + required inputs + beat structure + Key rules + Workflow + Anti-patterns |
| [`prompt-cookbook.md`](./prompt-cookbook.md) | Per-stage prompts with `{{slots}}` for image / video / music / SFX |
| [`model-stack.md`](./model-stack.md) | Per-stage model defaults + cost breakdown + known breakage |
| [`hooks.md`](./hooks.md) | 0-2s hook patterns (4 variants) + hook design rules |
| [`examples.md`](./examples.md) | 2 worked variant fills: Playdate, Nothing Ear (a) |
| [`template.json`](./template.json) | Metadata for `ralphy template list / show / suggest` |
| [`assets/`](./assets) | Tile-grid floor + hyperpop palette + Japanese arcade style references |

## Quick start

```bash
ralphy template use japanese-hypermotion-product-ad \
  --project my-new-product-001 \
  --brief "15s Japanese hyperpop ad for the <product> by <brand>"
```

Then read `TEMPLATE.md` → fill required slots → follow `prompt-cookbook.md` per scene → render via `ralphy render my-new-product-001`.

## Cost ballpark

- Disciplined run: **~$7-8** (image $3 · video $4 · music subscription · render local)
- Realistic with 1 creative iteration: **~$10-12**

See `model-stack.md` for per-stage breakdown.

## When to pick this template

Use when:
- You have a small consumer gadget with strong brand-text + accent color + visible internals or screen content.
- Target audience is gadget + anime crossover (JP TikTok, gen-z gadget channels, otaku tech reviewers).
- You explicitly want a high-cut, high-energy 15s ad — not a 30s explainer, not a 60s narrative.

Don't use when:
- Multi-product / lineup ad — the identity-lock works on ONE product.
- Service / software / SaaS — no physical product to orbit or explode.
- Apparel / fashion — tile-grid stage doesn't carry.
- You need a VO lane — this format is music + SFX only by design.

## Origin

Distilled from `workspace/projects/flipper-hypermotion-001/` (May 2026) — Flipper Zero / Japanese arcade hyperpop ad. Final winner: `final-music-b.mp4` (japanese-electronic-glitch sakura-trap variant). ~$14.30 spent across one full project + one creative iteration on the human-orbit scene.

The template's beat structure, prompt patterns, model picks, and music-variant findings are all carried verbatim from that project's POSTMORTEM.md.
