# multi-scene-product-launch

> 27-shot, 50-60s identity-locked product launch in 9:16. Two AI cast members in BTS-commercial-set vignettes around a hero hardware product. Source audio 1:1 (no VO regen). Cool desaturated grade. Built for consumer-electronics launches where the product needs 20+ short vignettes to build ritual + spec + lifestyle, and where identity drift across that many shots is the dominant production risk.

## What it produces

- **Aspect / duration:** 1080x1920 @ 30fps, 50-60s
- **Shots:** 22-28 (typical 27)
- **Format:** behind-the-scenes commercial-set montage with title-card bookends
- **Vibe:** cool desaturated blue grade, soft top key + cool fill, lab-coat crew in frame, printed-fabric backdrops (forest / city / moon), industrial treadmill props, foam-panel sound room
- **Cast:** 2 identity-locked AI models (optional single-cast variant)
- **Audio:** source-1:1 by default; ElevenLabs Music optional for non-recreation variants

## Required user inputs

1. **Product reference set** — 4+ multi-angle photos of the actual product. Required.
2. **One base portrait per cast member** — identity anchor photos.
3. **Optional: source mp4 URL** — if recreating an existing commercial, pull via `ralphy ref pull` + `ralphy ref analyze-video --shots <N>`.

Without (1) and (2) the template degrades to text-only descriptions, which drift catastrophically across 27 scenes — the master-shot pipeline this template enforces is the entire point.

## Slots

`{{brand_name}}`, `{{product_name}}`, `{{product_descriptor}}`, `{{model_a}}`, `{{model_a_wardrobe}}`, `{{model_b}}`, `{{model_b_wardrobe}}`, `{{set_backdrop_a}}`, `{{set_backdrop_b}}`, `{{brand_slogan}}`, `{{brand_url}}`, `{{scene_count}}`, `{{target_language}}`.

See `TEMPLATE.md` "Required inputs" for the full table with example values.

## Use it

```bash
ralphy template use multi-scene-product-launch --project <new-id> \
  --brief "<one-line brief — brand, product, register>"
```

This scaffolds `workspace/projects/<new-id>/` with the template's locked-ref assets copied in. Note: this template is `vibe-style`, NOT `vibe-reference` — you will hand-author the Remotion composition at `src/videos/<new-id>/` (the source project's composition at `src/videos/nothing-hp1-001/` is a reference pattern, not generic).

## Cost ballpark

| Pass | Spend |
|---|---|
| Single-pass disciplined run | **~$30** |
| With one regen pass on rejected scenes | **~$45** |
| Source project's actual spend (6 iteration passes) | $50.69 |

See `model-stack.md` for the per-stage breakdown and `prompt-cookbook.md` for the locked prompt template that makes single-pass viable.

## Duration ballpark

| Phase | Wall time |
|---|---|
| Source acquisition + shot detection | 5-15 min |
| Folder scaffold + symlink + audio extract | 2 min |
| Product hero masters (1 batch, 4 variants per angle, 5-8 angles) | 5 min |
| Character identity masters (2 cast x 4 variants) | 3 min |
| Scene keyframes (27 scenes x 4 variants, parallel) | ~80 sec compute + ~30 min human review |
| i2v batch (22-25 clips, parallel, Kling poll) | ~10 min |
| Remotion composition author + render | 30-60 min author + 1-2 min render |
| **Total** | **~2.5-4h** including review |

## File map (this template)

| File | What it is |
|---|---|
| `template.json` | Metadata, slots, stack summary, assets list — consumed by `ralphy template list / show / suggest / use` |
| `TEMPLATE.md` | Main doc: vibe + required inputs + beat structure + key rules + anti-patterns + workflow |
| `prompt-cookbook.md` | Locked prompts per stage with `{{slots}}` substituted — copy-paste-ready |
| `model-stack.md` | What worked / what failed / cost rollup / params |
| `hooks.md` | 0-2s opening patterns + variants + what doesn't work as a hook here |
| `examples.md` | 2 worked variant briefs (premium audio + fitness wearable) |
| `README.md` | This file |
| `assets/refs/characters/` | Sample identity-locked character + wardrobe refs from the source project (replace with your own) |
| `assets/refs/product/` | Sample product reference photos from the source project (replace with your own) |

## Postmortem status

**Postmortem absent.** The source project (`workspace/projects/nothing-hp1-001/`) does not have a canonical 6-file `postmortem/` directory. The `TEMPLATE.md` "Key rules" + "Anti-patterns" + "Workflow" sections were reconstructed from `WORKFLOW.md` + `BEST-PRACTICES.md` in the source-project root — they are rich but not the canonical /postmortem split.

**Recommendation:** run `/postmortem` on the next project that uses this template. The chronological / lessons / bugs / cost / workflow rollup will feed back into this TEMPLATE.md's lived-experience section.

## See also

- `templates/CATEGORIES.md` — dtc-commerce roster
- `docs/playbooks/producer.md` — end-to-end pipeline this template fits into
- `docs/playbooks/art-director.md` — asset / prompt orchestration
- `MODELS.md` — current model picks (verify before each call; Claude's training is stale)
