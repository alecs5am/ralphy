# Quality gate

**Hard rule (inherited from `AGENTS.md`):** quality gates refuse, not warn. Two failures in a row → stop + concrete options. We don't render mp4 over a failed gate.

## Three checks

All live in `cli/lib/quality.ts`. They return `{ passed: boolean, failures: string[], warnings: string[] }`.

### `scoreScenario(scenario)` — non-LLM checklist

Trigger: after `prepare-prompts`. Run via `ralphy project score <id>`.

What's checked:
- hook in the first 3 seconds (a `hook` field exists or scene-01 has a text_overlay with a hook formula)
- ≤15 seconds total duration
- every scene has VO (or is explicitly `silent: true`)
- no green-zone violations for text_overlay (see `docs/green-zone.md`)
- no named persona without an `image_urls` ref (ref-photo gate)

### `scoreImage({ path, slot })` — LLM-vision

Trigger: after `ralphy generate image` (automatic if the `--gate` flag is set, or by default after Sprint 4).

Uses `google/gemini-2.5-flash` via `callLLM()`. Prompt:
> "Rate this image on three axes 1-10: clarity (sharpness, no artifacts), composition (subject framed, no awkward crops), on-prompt fidelity (matches given prompt). Return JSON: { clarity, composition, fidelity, comment }."

Pass: average ≥7. Fail: average <7.

### `scoreVideo({ path, slot })` — LLM-vision on 3 frames

Trigger: after `ralphy generate video`.

Same 3 axes + motion-stability (no morphing of face, hands) + audio-sync (if there's audio). Frames are extracted via ffmpeg at `0%`, `50%`, `100%` of the duration, vision-call on each, aggregated as avg.

## Failure handling

**One fail:** automatic regeneration with a slightly changed input (new seed; if seed has already been changed — model swap; if a model swap has already happened — slight prompt rewrite).

**Two fails in a row:** **STOP.** No quiet third pass.

Report template for the user:

> "Can't produce a quality image for slot `<id>` (attempts: 2, latest avg score: <n>/10).
> Options:
> a) drop a better reference — there's no matching photo for this scene in `assets/uploaded/`;
> b) switch model (current `<m>`, we can try `<premium>`);
> c) change the shot — e.g. close-up to medium, or a different angle.
> What do we do?"

## Pre-render check

Before `ralphy render <id>` — final sweep: for each slot in `asset-manifest.json` check `score >= 7` (or `score: null` means the gate hasn't been run yet → run it).

If even one slot is < 7 — refuse render with the same template (but specify the exact slot).

## Suppressing the gate

The user can explicitly request a bypass:
> "skip quality gate, render what's there"

We log it as `stage: "gate-bypass-consent"` and continue. This is a rare case — usually it's easier to regenerate.
