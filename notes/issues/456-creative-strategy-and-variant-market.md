# Creative strategy and variant market

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** creative-strategy / variants

## Context

The content-farm goal is not one perfect output. It is many controlled attempts
across hooks, personas, styles, CTAs, first frames, music beds, and platforms,
with a system for choosing winners.

#421 tracks variant tournaments, but the strategy layer above generation still
needs definition. Without that layer, variants become random volume instead of
purposeful creative experiments.

## What

Add a creative strategy layer that defines hypotheses before generation:
audience segments, offers, objections, angles, hooks, variant axes, expected
platform fit, and success criteria. The variant market then runs controlled
A/B/C experiments, scores them, preserves losing variants with reasons, and
feeds results into future batches.

## Why it matters

At scale, media quality improves by learning which creative directions win.
The agent should allocate budget toward intentional experiments, not arbitrary
rerolls.

## Scope / acceptance

1. **Strategy artifact.** Add `CREATIVE_STRATEGY.json` / Markdown with audience,
   offer, hypothesis, angle, hook, proof, objection, CTA, and variant axes.
2. **Variant matrix.** Emit a matrix that #421 can execute: slots, axis varied,
   hypothesis, expected cost, and evaluation criteria.
3. **Pre-generation review.** Council or plan grader can reject weak strategies
   before media spend.
4. **Winner feedback.** Variant tournament results update the strategy artifact
   with champion, losing rationale, and next-batch suggestions.
5. **Mode support.** Cover at least ad-creative-pack, UGC review, social
   carousel, product-shot, and personal clipper.
6. **Performance extension seam.** Define where future platform metrics would
   be imported, without requiring platform integrations in the first pass.

## Dependencies and linked work

- Variant tournaments: #421.
- Model telemetry: #424.
- Readiness scorecard: #427.
- Prompt benchmarks: #430.
- Distribution pack: #423.

## Notes

- Strategy happens before generation. Council reviews it; variant engine
  executes it; model telemetry learns from it.
