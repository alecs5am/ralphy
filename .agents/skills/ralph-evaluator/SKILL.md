---
name: ralph-evaluator
description: >-
  Quality evaluation of rendered UGC mp4s — scene segmentation, audio loudness / dead-air, caption density, and per-scene visual analysis. Produces an actionable report (eval.json + eval-report.md) sized for a downstream fixer agent.
  USE WHEN the user asks to "evaluate / score / grade / review / QA / check quality of" a rendered video, asks "is this video good?", drops an mp4 path with no other instruction, mentions "find issues / problems / artifacts in this video", asks for retention or scroll-stop assessment, or has just rendered something and wants verification before publishing.
  TRIGGER (EN): "evaluate this video", "score the render", "grade the mp4", "review the final cut", "QA this video", "is this ready to ship", "what's wrong with this video", "find issues in <path.mp4>", "check the render", "audit the video", "scene-by-scene breakdown", "retention check", "quality gate".
  TRIGGER (RU): "оцени", "оцени что вышло", "оцени рендер", "проверь рендер", "проверь видео", "что не так с видео", "найди косяки", "разбор рендера", "готово к публикации", "финальный аудит", "оценка качества".
  ALSO FIRE when the user just dropped a path that ends in `.mp4` from `workspace/projects/<id>/render/` with no other instructions, or when an editor handed off and the user asks "and now?" (any language).
  DO NOT FIRE for unrendered projects (handback to editor for `ralphy render`), for raw research downloads (those go through researcher's `analyze-video` flow, not eval), or for source media that hasn't been composed yet.
  HARD INVARIANTS: every model call (vision pass) routes through `cli/lib/providers/llm.ts → callLLM()` via the CLI. No direct OpenAI / fal calls. Findings are deterministic outputs of `cli/lib/eval/*` — don't paraphrase them; pass through verbatim to the fixer agent.
---

# ralph-evaluator

You evaluate rendered UGC videos and produce a report that another agent (the fixer) can act on without reading the video itself. The contract is: **the report is the handoff**.

## What this skill is not

- Not a researcher tool. For "analyze this TikTok/Reel from a creator I want to imitate", route to `/ralph-researcher`.
- Not a fixer. The findings list is meant to be read by a separate agent (or the editor / art-director / scenarist) that will execute the fixes. Don't try to fix issues from inside this skill — that's a different role and would skip the user's chance to triage.
- Not a publisher / scheduler. Verdict is informational, not a publish gate.

## The single command

```bash
ralphy eval video <path-to-mp4>
```

Auto-detects the project ID when the mp4 lives at `workspace/projects/<id>/render/...`. If detected, the report incorporates `scenario.json`, `captions.json`, and the template name from the project — these unlock the *declared-vs-actual* findings (duration drift, hook-zone-thin-vo, etc.) that are otherwise unavailable.

Useful flags:
- `--no-vision` — skip the per-scene Gemini pass. Faster (~3s vs ~30s on a 1-min video) and free. Use it for quick structure / audio sanity, then re-run without the flag for the full check.
- `--project <id>` — force project context when the mp4 was moved out of the project tree.
- `--no-project` — explicitly evaluate as a standalone video (skips `scenario.json`-derived findings).
- `--out-dir <path>` — override where `eval.json` + `eval-report.md` land. Default: project dir, or the mp4's parent for standalone.

The command returns JSON with `verdict`, `score`, `findings` (count), and the two output paths.

## How to read the report

Two files written:
- `eval.json` — machine contract. The fixer agent reads this. Schema in `references/report-schema.md`.
- `eval-report.md` — same data flattened for humans. Show the user this one.

The shape that matters: `report.findings[]` is the actionable list. Each finding has:
- `id` (F1, F2, …) — stable ref to call out in chat
- `category` — taxonomy like `audio.loudness`, `vision.text`, `structure.duration-drift`
- `severity` — `info` | `warn` | `fail`
- `sceneIndex` + `timestampSec` — where in the video, when applicable
- `message` — what's wrong (specific, not generic)
- `fixHint` — what kind of fix, conceptually
- `fixCommand` — a copy-pasteable `ralphy` / `ffmpeg` command if one applies

`scoring.verdict` is `pass`, `warn`, or `fail`. It's a summary, not an enforcement gate — the user decides whether to ship.

## Workflow

1. **Confirm the path.** If the user gave a project id instead of an mp4 path, resolve to `workspace/projects/<id>/render/final.mp4` (or whatever the project's render output is — check `composition-props.json` if the path isn't obvious).
2. **Run** `ralphy eval video <path>`. Default to full vision unless the user says otherwise; the cost is small and the vision findings are usually the most useful ones.
3. **Show** the markdown report to the user, highlighting the verdict and the top 3-5 findings by severity.
4. **Hand off** if the user wants fixes. The fixer agent reads `eval.json` directly — don't summarize the findings into your own prose, just point at the path. Suggested handoffs by finding category:
   - `vision.text`, `vision.composition`, `vision.ai-artifacts`, `vision.quality` → `/ralph-art-director` (regen affected keyframes / tweak prompts).
   - `structure.duration-drift`, `structure.hook-zone-*` → `/ralph-scenarist` (re-time / re-script).
   - `audio.*`, `format.*` → `/ralph-editor` (loudnorm / re-render / re-cut).
   - `captions.*` → `/ralph-editor` (regenerate captions or tighten the script).

## When findings are clearly false-positives

The eval pipeline is tuned for the common UGC cases. Some templates legitimately violate "rules" — the brainrot-ai-meme top-half is often a single static image for the whole clip, which fires `structure.hook-zone-static`. Don't suppress in code; instead, in the chat handoff, mark such findings as expected-for-template so the fixer agent skips them.

## Handoff to a fixer agent

When the user says "fix the issues" or similar, a downstream agent will read `eval.json`. The minimum it needs from you:
- Path to the report
- Path to the original mp4
- Project id (if any)
- Optional: which finding ids to skip (template false-positives)

Do not try to fix from inside ralph-evaluator. The skill ends at the report.

## References

- `references/report-schema.md` — full JSON schema of `eval.json`
- `cli/lib/eval/findings.ts` — rule taxonomy + thresholds (the source of truth for `category` and severity ladders)
- `MODELS.md` — vision model used (`google/gemini-2.5-flash` via OpenRouter)
- `docs/green-zone.md` (when added) — the safe-zone geometry the vision prompt references
