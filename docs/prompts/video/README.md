# Video prompt cookbook

Per-model formulas + mode catalog for every video model the CLI dispatches to. Read the file matching the model you're calling; pattern-match the closest mode; fill the slots; pass through `ralphy generate video --model <id> --prompt "<shaped>"`.

> **Adapter does this for you.** `cli/lib/providers/prompt-adapter/<model>.ts` consumes a normalized prompt shape and emits the per-model formula. This cookbook is the source of truth for the **formula + the modes**; the adapter is the build-time enforcement layer.

## Models covered

| Model family | File | Modes |
|---|---|---|
| Kling v3.0 (pro / std / o1) | [kling.md](kling.md) | 5 |
| Google Veo 3.x | [veo.md](veo.md) | 5 |
| Luma Ray-2 / Ray-3 | [luma.md](luma.md) | 5 |
| Runway Gen-4 | [runway.md](runway.md) | 5 |
| Pika 2.x | [pika.md](pika.md) | 5 |
| OpenAI Sora | [sora.md](sora.md) | 5 |

## File anatomy

Each per-model file follows the same structure:

1. **Prompt skeleton** — the exact order and syntax the model expects.
2. **Modes** — 5 named modes (e.g. `selfie-talking-head`, `pov-walking`) each with:
   - **When to use** — the situational fit.
   - **Formula** — the slot-filled skeleton.
   - **Sample prompt** — a worked example.
   - **Don't** — common failure modes that produce slop.
