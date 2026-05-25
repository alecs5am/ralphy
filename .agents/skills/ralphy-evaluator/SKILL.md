---
name: ralphy-evaluator
namespace: ralphy
description: >-
  Quality evaluation of rendered UGC mp4s — scene segmentation, audio loudness / dead-air, caption density, and per-scene visual analysis. Produces an actionable report (eval.json + eval-report.md) sized for a downstream fixer agent.
  USE WHEN the user asks to "evaluate / score / grade / review / QA / check quality of" a rendered video, asks "is this video good?", drops an mp4 path with no other instruction, mentions "find issues / problems / artifacts", asks for retention or scroll-stop assessment, or has just rendered something and wants verification before publishing.
  TRIGGER (EN): "evaluate this video", "score the render", "grade the mp4", "review the final cut", "QA this video", "is this ready to ship", "what's wrong with this video", "find issues in <path.mp4>", "audit the video", "scene-by-scene breakdown", "retention check", "quality gate".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# ralphy-evaluator

## Trigger refinements

**ALSO FIRE** when the user just dropped a path that ends in `.mp4` from `workspace/projects/<id>/render/` with no other instructions, or when an editor handed off and the user asks "and now?" (any language).

**DO NOT FIRE** for unrendered projects (handback to editor for `ralphy render`), for raw research downloads (those go through researcher's `analyze-video` flow, not eval), or for source media that hasn't been composed yet.

## Hard invariants

- Every model call (vision pass) routes through `cli/lib/providers/llm.ts → callLLM()` via the CLI. No direct OpenAI / fal calls.
- Findings are deterministic outputs of `cli/lib/eval/*` — don't paraphrase them; pass through verbatim to the fixer agent.

---

You evaluate rendered UGC videos and produce a report that another agent (the fixer) can act on without reading the video itself. The contract is: **the report is the handoff**.

## What this skill is not

- Not a researcher tool. For "analyze this TikTok/Reel from a creator I want to imitate", route to `/ralphy-researcher`.
- Not a fixer. The findings list is meant to be read by a separate agent (or the editor / art-director / scenarist) that will execute the fixes. Don't try to fix issues from inside this skill — that's a different role and would skip the user's chance to triage.
- Not a publisher / scheduler. Verdict is informational, not a publish gate.

## The single command

```bash
ralphy eval video <path-to-mp4>
```

Auto-detects the project ID when the mp4 lives at `workspace/projects/<id>/render/...`. If detected, the report incorporates `scenario.json`, `captions.json`, `BRIEF.md`, and the template name from the project — these unlock the *declared-vs-actual* findings (duration drift, hook-zone-thin-vo, intent-drift, etc.) that are otherwise unavailable.

### Deep-vision pass (project-specific, anti-generic findings)

When the user asks "validate against my niche / style / creator reference" — or you observe that the project has a style-sheet (typically from `ralphy research scrape-profile`) — pass `--style-sheet <path>` to enable the **deep-vision pass**: gemini-3.1-pro-preview ingests the full mp4 natively (millisecond-precision scene understanding, not sampled keyframes) and scores it against every rule in the style sheet's "Vibe & visual register" and "What this creator NEVER does" sections.

```bash
ralphy eval video <mp4> --style-sheet <style-sheet.md> [--brief <BRIEF.md>] [--reference-urls <url> <url> ...]
```

The deep-vision pass produces a separate structured JSON output at `<out-dir>/eval-deep-vision.json` with:
- `overall_verdict` — holistic pass/warn/fail
- `register_match` — declared vs observed cinematographic register, with severity if mismatched
- `rule_conformance[]` — per-rule pass/warn/fail with **verbatim style-sheet quotes** and **specific timestamp evidence** from the rendered video
- `brief_conformance[]` — same shape, scoring against BRIEF.md intent
- `uncanny_mechanism_check` — whether the render delivers the style sheet's proprietary aesthetic mechanism or just mimics the surface
- `pacing_and_timing` — hook / body / closer evaluation
- `ai_artifacts[]` — concrete timestamp-tagged artifacts the model spotted
- `what_works` — be honest, what the render did right
- `what_to_redo` — prioritized 1-6 item fix list with `target` (start-frame / end-frame / i2v / audio / scene-prompt / model-swap / regen-entire)

Each rule violation also flows into the main `findings[]` array under `style.register-mismatch`, `style.rule-violation`, `brief.intent-drift`, `style.aesthetic-mechanism-missing`, or `style.timing-*` categories so the unified scoring + downstream fixer pipeline pick them up.

**When to fire the deep pass automatically:**
1. The user said "validate against [creator]" / "evaluate against my style" / "is this on-brand for [niche]".
2. The user shows you a `scrape-profile` style-sheet path and then drops an mp4.
3. You're running an eval on an mp4 in a project that has a sibling style-sheet (search `workspace/.ralph/research/*/style-sheet.md` and ask the user to confirm which one applies if multiple).
4. The project has its own `style-sheet.md` at `workspace/projects/<id>/style-sheet.md` (auto-detected — wired in a follow-up; for now, pass `--style-sheet` explicitly).

**When NOT to fire the deep pass:**
- Generic UGC quality check (no creator-style reference, just "is this video good"). The standard per-scene flash pass handles this — cheaper and faster.
- The user said `--no-deep-vision`.
- The mp4 is over 40 MB — the model rejects on body size. Re-encode at lower bitrate first.

### Standard flags

- `--no-vision` — skip the per-scene Gemini pass. Faster (~3s vs ~30s on a 1-min video) and free. Use it for quick structure / audio sanity, then re-run without the flag for the full check.
- `--no-deep-vision` — skip the deep-vision pass even if `--style-sheet` / `--brief` / project `BRIEF.md` is present. Useful when you want only the structural findings.
- `--deep-vision-model <id>` — override the deep-vision model. Default `google/gemini-3.1-pro-preview`. For cheaper smoke tests, swap to `google/gemini-2.5-pro`.
- `--project <id>` — force project context when the mp4 was moved out of the project tree.
- `--no-project` — explicitly evaluate as a standalone video (skips `scenario.json`-derived findings).
- `--out-dir <path>` — override where `eval.json` + `eval-report.md` + `eval-deep-vision.json` land. Default: project dir, or the mp4's parent for standalone.

The command returns JSON with `verdict`, `score`, `findings` (count), and the output paths.

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

Do not try to fix from inside ralphy-evaluator. The skill ends at the report.

## References

- `references/report-schema.md` — full JSON schema of `eval.json`
- `cli/lib/eval/findings.ts` — rule taxonomy + thresholds (the source of truth for `category` and severity ladders)
- `MODELS.md` — vision model used (`google/gemini-2.5-flash` via OpenRouter)
- `docs/green-zone.md` (when added) — the safe-zone geometry the vision prompt references
