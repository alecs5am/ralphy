# Variant tournament system

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

The last month's postmortems repeatedly used variants: 32 App Store screenshots, music A/B/C, multiple product masters, alternate scene repairs, and prompt rerolls. #024 covers batch and variant generation, but not the decision loop that chooses a winner.

## What

Add a variant tournament workflow: generate controlled A/B/C variants, score them against the production contract and benchmark set, pick a champion, and preserve the losing variants with reasons.

## Why it matters

Content farms should optimize winners, not merely produce many assets. A controlled tournament makes variation purposeful: hook, first frame, creator persona, product master, caption style, CTA, music bed, or motion model.

## Scope / acceptance

- Define a `VARIANT_MATRIX` or equivalent artifact listing axes, hypotheses, slots, and expected cost.
- Add review output that ranks variants with scores and reasons.
- Integrate with native-video eval for video variants and image scoring for still packs.
- Persist champion selection and losing-variant rationale into Unit provenance.
- Add a cheap mode for manual visual review and a model-assisted mode for final scoring.
- Add fixtures for an image-pack tournament and a video music-bed tournament.

## Notes

- Builds on #024, #411, #415, and #420.
- Do not delete losing variants; they are training data for future prompts and postmortems.
