# tokyo-y2k-cinematic

> Long-form 75s cinematic near-miss arc. Locked-off tripod, 35mm Portra 400, frame-within-a-frame, zero diegetic audio, adagio piano-bed. Two strangers, one city, never speak. Ships dual-aspect (9:16 letterboxed 1.85:1 + 16:9 native).

## What this is

A **vibe-style** template — prompt cookbook + hooks + model stack + worked variants. NO Remotion composition included (the source project's Remotion at `src/videos/tokyo-y2k-001/` is project-specific; consumers hand-author their own using the patterns in `TEMPLATE.md` → "Composition tricks").

Crystallized from `workspace/projects/tokyo-y2k-001/` (user rating 8.5/10, *"очень эстетично приятно видео получилось"*).

## When to use this template

- Long-form cinematic short (60-90s) for TikTok / Reels / Shorts / YouTube
- Style: contemplative, near-miss, frame-within-frame, locked-off tripod
- Subject: 2-hander (or single-protagonist drift) in a dense Asian metropolis
- Music: adagio piano / strings / cinematic-instrumental (no dialogue, no VO, no captions)
- Aspects: dual-output (9:16 letterboxed 1.85:1 + 16:9 native) from one timeline

## When NOT to use this template

- Viral hyper-cut formats (use `japanese-hypermotion-product-ad` or `cinematic` instead)
- Product / brand showcases (use a dtc-commerce template)
- Anything with on-screen text / captions / VO (this template's zero-text / zero-VO is structural)
- Real named people (the template's cast is fictional — if you need a real person, you need a reference-required scenario)

## How to use it

1. Read `TEMPLATE.md` first — the "Key rules" + "Workflow" sections distill the source project's expensive lessons.
2. Pick a variant from `examples.md` (Tokyo source / Seoul-1990s / Hong Kong-vaporwave) closest to your brief, OR fill the slots in `prompt-cookbook.md` from scratch.
3. Run the image stage (gemini-3-pro-image-preview + locked character master refs).
4. Run the video i2v stage (kling-v3.0-pro for human shots, seedance-2.0 for landscape / hands-only).
5. **Run the trim-analysis pass** — `ralphy ref analyze-video` per clip in parallel (xargs -P 6). This is **mandatory**, not optional — Kling / Seedance overshoot the requested duration by ~1s every time.
6. Author Remotion scenes.ts + index.tsx (use the source project's `src/videos/tokyo-y2k-001/` as a structural reference but rewrite for your slots).
7. Stub `composition-props.json` with `{"compositionId":"<X>"}`.
8. `ralphy render <id>` for both 9:16 and 16:9 aspects.
9. `/ralph-evaluator` quality gate before publish.

## Cost ballpark

- **Minimum viable** (anchor v1 lands the grade, no register pivot): ~$15-20
- **Source project actual** (1.4× minimum due to v1→v2 90s-film register pivot): ~$22.35

See `model-stack.md` for the per-phase breakdown.

## Files in this template

| File | What it is |
|---|---|
| `template.json` | Metadata, tags, slots, model defaults, dual-aspect output hint |
| `TEMPLATE.md` | Vibe + Key rules + Workflow + Required inputs + Anti-patterns + Composition tricks |
| `prompt-cookbook.md` | Verbatim per-stage prompts (image / video / trim-analysis / music) with `{{slots}}` |
| `model-stack.md` | What worked vs. what we dropped + cost ballpark per phase |
| `hooks.md` | Six 0–2s establishing-shot patterns |
| `examples.md` | Source instance + Seoul-1990s + Hong Kong-vaporwave worked variants |
| `assets/` | Locked-ref masters (regenerate per project; included as Tokyo-instance reference) |

## Provenance

- **Source project:** `workspace/projects/tokyo-y2k-001/` (2026-05-18 → 2026-05-19)
- **Style anchor:** KYO KIMURA — `honeybee` (x.com/noukin_camera/status/2041722047022428265)
- **Postmortem:** `workspace/projects/tokyo-y2k-001/postmortem/` (5 docs)
- **Final renders:** `render/final.mp4` (33.5 MB, 9:16) + `render/final-16x9.mp4` (78 MB, 16:9)
- **Templater run:** 2026-05-19 (manual, CLI verb `ralphy template create-from-project` not yet shipped)
