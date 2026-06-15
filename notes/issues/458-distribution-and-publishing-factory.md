# Distribution and publishing factory

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** distribution / publishing

## Context

The user wants production of media content in any quantity. Generation is only
half of that job. Finished media needs platform-ready packaging, titles,
captions, thumbnails, hashtags, ad copy, ZIPs, selected sets, and upload-ready
specs.

#423 tracks Unit distribution packs. This issue expands that into the full
distribution/publishing phase for the media factory.

## What

Make distribution a first-class production phase. Every shippable Unit can
produce one or more platform packs for TikTok, Reels, Shorts, Meta ads, App
Store, Amazon, web, or custom channels. The pack includes platform metadata,
safe-area validation, selected assets, thumbnail choices, copy variants, and
publish notes.

## Why it matters

Users buy outcomes, not files. A media factory that stops at `final.mp4` still
leaves manual publishing work and loses quality at the edge.

## Scope / acceptance

1. **Distribution schema.** Extend #423 into a channel-aware schema with media,
   copy, thumbnails, hashtags, titles, safe-area status, filenames, and export
   requirements.
2. **Channel profiles.** Use #443 platform profiles for validation and output
   shape.
3. **Packaging commands.** Provide an agent-facing packaging path for selected
   deliverables: ZIPs, ordered image sets, video files, metadata Markdown, and
   JSON.
4. **Copy integration.** Consume #403 social-copy outputs rather than duplicating
   caption/hashtag logic.
5. **Readiness dependency.** Do not mark a distribution pack shippable unless
   readiness and platform specs pass or the user approves a bypass.
6. **Manual-first publishing.** Direct API upload is not required in the first
   implementation; correct package generation is the first milestone.
7. **Fixtures.** Cover short video, image pack, carousel, Amazon listing, and
   Meta ad pack.

## Dependencies and linked work

- Social copy: #403.
- Distribution pack: #423.
- Platform validator: #443.
- Library seed Units: #447.
- Library QA: #448.

## Notes

- Later extensions: scheduler, direct platform upload, performance import, and
  team review workflow.
