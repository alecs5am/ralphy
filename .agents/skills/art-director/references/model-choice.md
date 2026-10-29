# Model choice

**Single source of truth: the model registry.** Pick from the `MODELS.md` index, then confirm with `ralphy models show <id>` (limits, quirks, live video params). Don't hardcode model-id from memory.

## Decision tree

```
need: image
  → multi-ref (consistency between scenes) → google/gemini-3-pro-image-preview
  → premium photorealism without strict consistency → openai/gpt-5.4-image-2

need: video (i2v)
  → narrative default → kwaivgi/kling-v3.0-pro
  → premium narrative or talking-head → google/veo-3.1
  → fast physics, sports, running → bytedance/seedance-2.0

need: voiceover
  → Russian → elevenlabs eleven_multilingual_v2
  → English premium → elevenlabs eleven_v3

need: music
  → instrumental bed → ElevenLabs Music (model_id: music_v1, force_instrumental: true)

need: transcribe
  → openai/whisper-1 via cli/lib/transcribe.ts (OpenRouter)
```

## Prompt guidelines for the picked model

After picking the model, read the guideline that covers the prompt you are about to write (`ralphy guideline show <slug>`).

| Prompt names | Guideline | What it gives |
|---|---|---|
| A camera move or framing in any video prompt (shot size, angle, push-in, pan, orbit, handheld, FPV, multi-shot coverage) | [`camera-language-video`](../../../../guidelines/camera-language-video/guideline.md) | Per-model camera vocabulary for every `MODELS.md` video model, one-move-per-shot phrasing, Hailuo bracket commands, multi-shot syntax per model, anti-patterns. Research pass: every row is `untested` until [`docs/research/camera-language-test-plan.md`](../../../../docs/research/camera-language-test-plan.md) runs. Edit-time moves (punch-in, shake, whip, Ken Burns) are the editor's [`virtual-camera.md`](../../editor/references/virtual-camera.md). |

## Cost preview

Before a batch — **always** state the estimate out loud:

> "N keyframes × gemini-3-pro-image-preview ≈ $X.XX, M × kling-v3.0-pro × Ts ≈ $Y.YY, K VO calls ≈ $Z.ZZ, music 1× ≈ $W. Total ≈ $T. Run?"

Pull prices from the `MODELS.md` index (or `ralphy models show <id>`). Real totals — from `generations.jsonl.cost_usd` of previous runs (Claude pricing knowledge stale).

## Inheritance from template

If the project was scaffolded from a template — **read `.ralphy/workspaces/<ws>/templates/<slug>/model-stack.md` first**. The template fixes a proven combo + failure modes. Don't deviate without reason.

## Switching models mid-project

When you switch models in the middle of a project (e.g. kling → veo for a complex shot) — write the reason in the `note` of the next `logGeneration`:

> `note: "moved kling-v3 → veo-3.1 because v3 dropped hands on intricate gesture"`

## Out-of-scope (don't call)

- `fal-ai/*` — gone in Sprint 2 (only OpenRouter + 11labs).
- `openai/dall-e-3`, `openai/gpt-image-1` — deprecated.
- Replicate / Apify / Higgsfield / Fireworks — no keys in the stack.
- Hardcoded URLs `openrouter.ai` or `api.openai.com` — go through `cli/lib/providers/`.
