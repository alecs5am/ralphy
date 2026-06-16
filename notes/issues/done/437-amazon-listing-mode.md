# Amazon listing designer mode

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Competitor products expose Amazon listing designer workflows. Ralphy already has image generation, product grounding, image-pack structure, and brand fidelity gates, but not a mode for listing images and marketplace-ready product cards.

## What

Add an Amazon listing mode that produces a set of marketplace images: hero, feature callouts, lifestyle, dimensions, comparison, usage, and guarantee/CTA where allowed.

## Why it matters

Marketplace creative is commercially valuable and strongly structured. A first-class mode can produce better outputs than generic ad creatives.

## Scope / acceptance

- Add a mode doc and route fixtures for Amazon/listing prompts.
- Define the default 6-8 image slot structure.
- Require product facts and claim-safe copy.
- Add safe-area/text-legibility requirements.
- Integrate with #422 product fidelity, #439 OCR gate, and #423 distribution pack.
- Add a packaging step that exports selected listing images with ordered names.

## Notes

- Keep platform policy checks conservative; do not invent product claims.
