# Batch variance and AI-tell lint

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** quality / craft-as-data / content-farm

## Context

A 30-item batch produced from one template has a structural fingerprint: same
hook shape, same intro cadence, same section skeleton, same caption formulas,
lengths clustered within seconds of each other. Readers and platform
heuristics both pick up on it. Separately, LLM prose carries known tells
(inflated symbolism, rule-of-three runs, em-dash overuse, negative
parallelisms, "delve"-class vocabulary, uniform paragraph rhythm) that are
lintable as data. Nothing in the pipeline checks either today.

## What

Two deterministic quality layers:

1. **Batch variance planner + gate.** At plan time (batch / campaign #528),
   assign each item a variance profile from rotation pools: hook type, intro
   structure, section order, target length (sampled from a range, not a
   constant), caption formula, CTA phrasing. At gate time, a cross-batch
   check measures structural similarity across the batch's produced units
   (shared n-gram openings, identical section skeletons, length clustering)
   and fails items above a similarity threshold with a concrete "vary X"
   finding for the repair loop.
2. **AI-tell prose lint.** A rule-pack over article/script/caption text:
   vocabulary list, punctuation-pattern rules (em-dash density, rule-of-three
   frequency), phrase-level patterns (negative parallelism, vague
   attribution), paragraph-rhythm uniformity. Warn/fail levels per rule,
   citations to source (the rules are documented editing guidance, same
   craft-as-data pattern as #514/#515). Wired as an eval criterion usable in
   `gate` nodes and in the #526 article gate.

## Why it matters

The farm's stated goal is quality x volume — and volume is exactly what
makes template fingerprints visible. Variance-by-plan is cheap at plan time
and expensive to retrofit after 30 renders. This is also the honest version
of "don't look like a bot": the content genuinely varies and reads well,
rather than being masked. (Fake engagement and platform-manipulation tactics
stay out of scope; platform synthetic-media disclosure settings remain the
user's explicit call at publish time.)

## Scope / acceptance

- Variance profile schema + rotation pools (per format: article / video
  script / short / caption); campaign plan (#528) and `batch create` stamp a
  profile per item; prompts receive the profile via `template-string` slots.
- Cross-batch similarity check as a deterministic eval
  (`cli/lib/eval/batch-variance.ts`): opening n-gram overlap, skeleton hash,
  length distribution; configurable thresholds; findings in the #409 repair
  vocabulary.
- AI-tell lint rule pack (`cli/lib/eval/prose-tells.ts` + data file): each
  rule carries source, level, examples; runs standalone
  (`ralphy eval prose <file>`) and as a gate criterion.
- Both gates produce repair-plan-consumable findings (owner: scenarist for
  structure, editor for captions).
- Tests: rotation assignment coverage, similarity math on fixture batches
  (one deliberately-samey, one varied), each prose rule fires on a violating
  fixture and passes clean prose.

## Notes

- Sequence after #526 (prose targets) and alongside #528 (planner
  integration); the prose lint alone is independently useful earlier.
- English-first rule pack v1; note the extension seam for other languages.
