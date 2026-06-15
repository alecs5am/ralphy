# Unit distribution pack

> **Status:** done — 2026-06-15
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

#403 covers social captions and hashtags. The content-farm ask is broader: a finished Unit should leave the pipeline with platform-ready packaging, not just media. Postmortems also show manual zips, selected sets, captions, titles, music variants, and final handoff bundles.

## What

Add a distribution pack step that packages a Unit for publication: platform captions, titles, hashtags, thumbnail/frame pick, ad primary text, CTA variants, selected media bundle, and a short publish note.

## Why it matters

Users do not only need generation. They need the thing ready to post, upload, test, or hand to a buyer. Distribution packaging turns Ralphy from a renderer into a content-farm operator.

## Scope / acceptance

- Define a `distribution-pack.json` plus Markdown handoff for finished Units.
- Include platform-specific outputs for TikTok, Instagram Reels, YouTube Shorts, Meta ads, and App Store/image-pack where applicable.
- Integrate #403 social-copy output instead of duplicating caption logic.
- Include thumbnail or poster-frame selection, with override support.
- Include zipped or copied selected deliverables without deleting original artifacts.
- Add `ralphy unit package` or extend `ralphy unit create` only if it reduces agent drift.
- Add fixtures for one video Unit, one carousel Unit, and one image-pack Unit.

## Notes

- Related: #403, #410, #414, and #420.
