# Platform spec validator

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Different outputs have platform-specific constraints: TikTok/Reels/Shorts safe areas, App Store screenshot dimensions, Amazon listing image ratios, Meta ad text density, file size, duration, audio loudness, and thumbnail requirements.

## What

Add a platform spec validator that checks final media and distribution packs against the declared target platforms.

## Why it matters

Users need publishable deliverables. A good render that fails upload specs or has text under platform UI chrome is not production-ready.

## Scope / acceptance

- Define platform profiles for TikTok, Reels, Shorts, Meta ads, App Store screenshots, Amazon listing images, and generic web.
- Validate aspect ratio, resolution, duration, file size, codecs, safe areas, and required metadata.
- Integrate with image-pack, video, carousel, and distribution-pack workflows.
- Add fixtures for pass/fail examples.
- Report concrete fixes, not generic warnings.

## Notes

- Related: #423 distribution pack, #429 image-pack workflow, #427 readiness scorecard.
