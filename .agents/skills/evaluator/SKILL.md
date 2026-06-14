---
name: evaluator
namespace: user
description: >-
  Quality evaluation of rendered UGC mp4s — scene segmentation, audio loudness / dead-air, caption density, and per-scene visual analysis. Produces an actionable report (eval.json + eval-report.md) sized for a downstream fixer agent.
  USE WHEN the user asks to "evaluate / score / grade / review / QA / check quality of" a rendered video, asks "is this video good?", drops an mp4 path with no other instruction, mentions "find issues / problems / artifacts", asks for retention or scroll-stop assessment, or has just rendered something and wants verification before publishing.
  TRIGGER (EN): "evaluate this video", "score the render", "grade the mp4", "review the final cut", "QA this video", "is this ready to ship", "what's wrong with this video", "find issues in <path.mp4>", "audit the video", "scene-by-scene breakdown", "retention check", "quality gate".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# evaluator

## Trigger refinements

**ALSO FIRE** when the user just dropped a path that ends in `.mp4` from `.ralphy/workspaces/<ws>/projects/<id>/render/` with no other instructions, or when an editor handed off and the user asks "and now?" (any language).

**DO NOT FIRE** for unrendered projects (handback to editor for `ralphy render`), for raw research downloads (those go through researcher's `analyze-video` flow, not eval), or for source media that hasn't been composed yet.

## Hard invariants

- Every model call (vision pass) routes through `cli/lib/providers/llm.ts → callLLM()` via the CLI. No direct OpenAI / fal calls.
- Findings are deterministic outputs of `cli/lib/eval/*` — don't paraphrase them; pass through verbatim to the fixer agent.
- **Keyframe slicing is a cheap diagnostic, NOT a ship gate (#411).** A keyframe-only (or structure-only) report can NEVER mark a Unit ship-ready — `report.gate.shipReady` is hard-false on it. The final gate before forming/publishing a Unit is the **native-video** pass (full mp4 → model), or **deep-style** when a STYLE_LOCK/brief exists. Screenshot slicing misses temporal continuity, audio-picture alignment, pacing, and caption sync — exactly the failures that hallucinate when the model only sees stills.

> **Where this sits in the Unit lifecycle.** Eval is phase 14 of the canonical [Unit lifecycle](../../../docs/playbooks/unit-lifecycle.md). Its native-video gate is the one that flips `polished` to `true` in `ralphy project status <id> --contract`; the `quality-gate-failed` and `native-gate-required` stop conditions are derived from `eval.json`'s `gate` / `scoring.verdict`. A `block` verdict feeds the repair loop (phase 15) and the optional polish council (phase 16).

---

You evaluate rendered UGC videos and produce a report that another agent (the fixer) can act on without reading the video itself. The contract is: **the report is the handoff**.

## What this skill is not

- Not a researcher tool. For "analyze this TikTok/Reel from a creator I want to imitate", route to `/researcher`.
- Not a fixer. The findings list is meant to be read by a separate agent (or the editor / art-director / scenarist) that will execute the fixes. Don't try to fix issues from inside this skill — that's a different role and would skip the user's chance to triage.
- Not a publisher / scheduler. Verdict is informational, not a publish gate.

## The single command

```bash
ralphy eval video <path-to-mp4>
```

Auto-detects the project ID when the mp4 lives at `.ralphy/workspaces/<ws>/projects/<id>/render/...` (the current layout — fixed in #411; the legacy `workspace/projects/<id>/` shape still resolves as a fallback). If detected, the report incorporates `scenario.json`, `captions.json`, `BRIEF.md`, `STYLE_LOCK.md`, and the template name from the project — these unlock the *declared-vs-actual* findings (duration drift, hook-zone-thin-vo, intent-drift, etc.) that are otherwise unavailable.

### Validation modes (`--mode`, #411)

Eval has four explicit modes, cheapest → most thorough. **Choose by what you're doing: a quick smoke check vs. the final gate before a Unit ships.**

| Mode | What it runs | Model spend | Can mark a Unit ship-ready? |
|---|---|---|---|
| `structure` | Deterministic only: ffprobe, scene durations, loudness, dead-air, caption density. No model call. | $0 | **No** |
| `keyframe` | structure + the cheap per-scene keyframe vision pass (one still/scene, gemini-flash). A smoke check for blank/garbled frames. | ~$0.01 | **No** |
| `native-video` | structure + a **full-mp4 model pass** (gemini-3.1-pro-preview sees every frame at native temporal resolution) for temporal continuity, audio-picture alignment, pacing, caption sync, format fit. No style sheet required. | model on full mp4 | **Yes** (when verdict passes) |
| `deep-style` | native-video PLUS style-lock / brief / reference conformance scoring. | model on full mp4 | **Yes** (when verdict passes) |

```bash
ralphy eval video <mp4> --mode native-video      # the final gate before forming/publishing a Unit
ralphy eval video <mp4> --mode keyframe           # cheap diagnostic only — does NOT approve a polished Unit
```

**Default (no `--mode`) = the final gate.** When you omit `--mode`, eval runs the **native-video** gate automatically if a model provider is configured (`OPENROUTER_API_KEY`), and upgrades to **deep-style** when a project `STYLE_LOCK.md` / `BRIEF.md` is discoverable. With NO credentials it falls back to `structure` and explicitly marks the report **not ship-ready** (a `eval.mode-downgrade` info finding records why).

**Why keyframe is not enough for a polished Unit:** a still never reveals a continuity jump between cuts, a caption that lags the VO, a music hit on the wrong frame, or a draggy hold. Those are exactly the failures the native-video pass catches and the keyframe pass hallucinates around. Use `keyframe` to triage fast and free; use `native-video` (or `deep-style`) as the gate before `ralphy unit` / publish. The report's `gate.shipReady` boolean is the authoritative signal — it is hard-false on any non-native report.

**Legacy flags (still work, mapped to modes):**
- `--no-vision` ⇒ `--mode structure`.
- `--no-deep-vision` ⇒ caps at `--mode keyframe` (never escalates to the full-mp4 pass).
- `--style-sheet` / `--brief` ⇒ implies `--mode deep-style`.

### Deep-style pass (project-specific, anti-generic findings)

When the user asks "validate against my niche / style / creator reference" — or the project carries a style-sheet (typically from `ralphy research scrape-profile` or `ralphy project style-lock`) — the **deep-style** mode scores the full mp4 against every rule in the style sheet's "Vibe & visual register" and "What this creator NEVER does" sections. Trigger it explicitly with `--mode deep-style`, or just pass `--style-sheet` (which implies it):

```bash
ralphy eval video <mp4> --style-sheet <style-sheet.md> [--brief <BRIEF.md>] [--reference-urls <url> <url> ...]
```

Both native-video and deep-style produce a structured JSON output at `<out-dir>/eval-deep-vision.json` (the repair loop, #409, consumes its `what_to_redo`). It carries:
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

**When to use deep-style over native-video:**
1. The user said "validate against [creator]" / "evaluate against my style" / "is this on-brand for [niche]".
2. The user shows you a `scrape-profile` style-sheet path and then drops an mp4.
3. The project has a discoverable `STYLE_LOCK.md` / `style-sheet.md` (auto-discovered by walking up from the mp4 path). Eval auto-upgrades the default gate to deep-style in that case.

**When native-video is the right gate (no style scoring):** a generic Unit-readiness check with no creator-style reference — "is this ready to ship", "QA the final cut". This is the default. It still catches temporal/audio/pacing/caption/format failures; it just doesn't score against a specific creator's rules.

**When NOT to run the full-mp4 pass at all:**
- A fast triage pass mid-iteration — use `--mode keyframe` (cheap, free-ish) but remember it can't approve a Unit.
- The mp4 is over 40 MB — the model rejects on body size. Re-encode at lower bitrate first.

### Standard flags

- `--mode <structure|keyframe|native-video|deep-style>` — the explicit validation mode (see the table above). Omit for the default final gate (native-video, or deep-style when a STYLE_LOCK/brief is discoverable).
- `--no-vision` — legacy alias for `--mode structure` (deterministic only, $0). Use for a quick structure/audio sanity pass; not a ship gate.
- `--no-deep-vision` — legacy: cap the mode at `keyframe` (never run the full-mp4 native pass even if a `--style-sheet` / `--brief` / project `BRIEF.md` is present).
- `--deep-vision-model <id>` — override the full-mp4 model. Default `google/gemini-3.1-pro-preview`. For cheaper smoke tests, swap to `google/gemini-2.5-pro`.
- `--project <id>` — force project context when the mp4 was moved out of the project tree.
- `--no-project` — explicitly evaluate as a standalone video (skips `scenario.json`-derived findings).
- `--out-dir <path>` — override where `eval.json` + `eval-report.md` + `eval-deep-vision.json` land. Default: project dir, or the mp4's parent for standalone.

The command returns JSON with `verdict`, `score`, `mode`, `shipReady`, `gateReason`, `findings` (count), and the output paths. **`shipReady` is the gate to honor before forming/publishing a Unit** — never form a Unit off a `shipReady: false` report unless the user explicitly accepted a cheap-mode result.

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

`scoring.verdict` is `pass`, `warn`, or `fail` — a quality summary. `report.gate` is the **readiness** signal: `gate.mode` (which mode ran), `gate.nativeVideo` (was it a full-mp4 pass), and `gate.shipReady` (the single boolean a Unit-forming step gates on). A `pass` verdict from a `keyframe` gate still has `shipReady: false` — keyframe slicing cannot approve a polished Unit. The user always decides whether to ship, but do not present a non-native report as ship-ready approval.

## Workflow

1. **Confirm the path.** If the user gave a project id instead of an mp4 path, resolve to `.ralphy/workspaces/<ws>/projects/<id>/render/final.mp4` (or whatever the project's render output is — check `composition-props.json` if the path isn't obvious).
2. **Run** `ralphy eval video <path>`. Omit `--mode` for the final gate — it runs native-video automatically (or deep-style when a STYLE_LOCK/brief is discoverable). Use `--mode keyframe` only when the user explicitly wants a fast/cheap triage and accepts it isn't a ship gate.
3. **Show** the markdown report to the user, highlighting `gate.shipReady`, the verdict, and the top 3-5 findings by severity. If `shipReady` is false because the run was a cheap mode, say so and offer to re-run native-video.
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

Do not try to fix from inside evaluator. The skill ends at the report.

## References

- `references/report-schema.md` — full JSON schema of `eval.json`
- `cli/lib/eval/findings.ts` — rule taxonomy + thresholds (the source of truth for `category` and severity ladders)
- `MODELS.md` — vision model used (`google/gemini-2.5-flash` via OpenRouter)
- `docs/green-zone.md` (when added) — the safe-zone geometry the vision prompt references
