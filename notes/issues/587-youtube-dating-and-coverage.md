# YouTube dating and coverage for the trend corpus

> **Status:** todo (additional, non-blocking)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** medium
> **Category:** trend-watch / sources

## Context

Most YouTube Shorts in the corpus are undated, so they are not scored or ranked: flat listings carry no post time, and free watch-page dating hits a bot check after about 15 calls (#576 run, 2026-10-29). `youtubeVideoDetails` (#556) already calls `videos.list` through the registered connector but no key is configured. The owner asked for YouTube as an additional, non-blocking task.

## What

- When the YouTube Data API key is configured: date and refresh every in-sample YouTube video through `videos.list` (50 ids per call, about 2,000 units for 100k videos against the free 10,000 per day), respect the 30-day refresh-or-delete rule, and rescore.
- Without a key: a free fallback that dates only Tier-1 candidates at a low rate (current watch-page budget), and an explicit "undated" coverage line in every report.
- Include YouTube in signals, tiers and niche reports once dated.

## Scope / acceptance

- With a key: all four niches' YouTube videos dated and scored; signal counts per niche include YouTube; quota use recorded.
- Without a key: reports state YouTube coverage and nothing fails.
- Tests with a stubbed connector.
