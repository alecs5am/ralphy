# Reference example — ai-vegetables

**Status: PLACEHOLDER** — fills in after the first real end-to-end run with this template.

## What should live here after the first run

- **Source project:** `workspace/projects/<id>/` — the first project that successfully shipped using this template.
- **Concrete scenario:**
  - hook line (in the chosen language)
  - 3-4 scenes with durations, VO, and a one-sentence visual description
  - actual `prompts.json` blocks (per-scene image and video prompts)
- **Music prompt** that worked.
- **Final mp4 path** + duration + cost.
- **What we noticed:**
  - which prompts gave clean output on the first try
  - which prompts needed regen and why
  - kling motion quirks observed on this format (e.g. "carrot leaves morphed when push-in > 8%")

## How to fill it

After the first finished video:

```bash
ralphy template extract --slug ai-vegetables --from-project <id>
```

This won't overwrite the existing `template.json`, `TEMPLATE.md`, `fragments.md`, `model-stack.md`, or `composition.md` — it only fills `reference-example.md`.

Or fill it by hand from:
- `workspace/projects/<id>/scenario.json`
- `workspace/projects/<id>/prompts.json`
- `workspace/projects/<id>/asset-manifest.json`
- `workspace/projects/<id>/logs/generations.jsonl` (cost rollup)
- `workspace/projects/<id>/logs/user-prompts.jsonl` (what the user asked to revise)

## Why this is empty for now

This template ships the structure and the prompt fragments. Filling `reference-example.md` requires ~$3-4 on a real run plus ~8 minutes of wall time. That's deferred until someone ships a video with the template — keeping it as a placeholder is honest.
