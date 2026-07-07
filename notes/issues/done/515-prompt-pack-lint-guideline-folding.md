# Prompt packs: model-aware lint + guideline folding

> **Status:** done — 2026-07-07
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** prompts / quality / craft-as-data

## Context

Bundle prompts are slot-templated files (#502) interpolated by
`template-string` (#498). Two craft layers are still missing headless: the
model-specific constraints agents apply from memory (kling's 2500-char cap,
the ban-music clause for kling VO scenes, no artist names for ElevenLabs
Music, the anti-AI-slop and photoreal-register rules), and the `@guideline:`
prompt-library folding that AGENTS.md invariant #13 mandates before drafting
any covered-register prompt.

## What

Two pieces:

1. **Prompt lint** — a deterministic pass over a workspace's prompt files +
   the nodes that consume them: per-(model, kind) rules (length caps, required
   clauses, banned content) checked at `workflow lint` time and at bundle
   export (#502). Rules as data with `source` citations, same pattern as #514.
2. **Guideline folding** — a node param `guidelines: [<slug>...]` on
   prompt-consuming nodes: at execution the guideline body's rules block is
   folded into the prompt the same way the agent does manually; the resolved
   prompt (post-fold, post-interpolation) is journaled for reproducibility.

## Why it matters

The training path bakes craft into prompts once; drift happens when a model
swap or a param tweak silently violates a constraint the agent would have
caught. Lint catches it at edit time; folding keeps guidelines applied when no
agent reads AGENTS.md at 2am.

## Scope / acceptance

- Rules schema + seed set: kling char cap + music-ban clause presence check,
  ElevenLabs artist-name detector, negative-cluster presence for photoreal
  registers (warn-level), per-model length caps from model constraints
  (#445's table — reuse, don't duplicate).
- `ralphy workflow lint` + `ralphy workspace export` run the prompt lint;
  errors name the file, the rule, and the fix.
- Guideline folding in the shared prompt-resolution path used by #511/#512
  executors; unknown slug = lint error; the folded prompt is written to the
  run journal (not to the prompt file — sources stay clean).
- `ralphy prompt lint <ws>` standalone verb for the training path.
- Tests: each seed rule fires on a violating fixture and stays quiet on a
  clean one; folding produces the journaled resolved prompt; export refuses
  on error-level violations.

## Notes

- Sequence after #511; export integration touches #502's readiness checks.
- Keep rules honest: only encode constraints with a documented origin
  (MODELS.md, memory slug, postmortem) — no speculative style policing.
