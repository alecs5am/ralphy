# Trend corpus at 100k+ videos: research and design

> **Status:** done — 2026-10-28 (docs/research/trend-corpus.md; #556 sharpened)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** research / trend-watch

## Context

Today's trend surfaces are `research scrape-trends` (TikTok hashtag pages via Playwright, ranked by `scoreTikTok()`), `research scrape-profile` (one creator), and the #500 ingestion nodes (firecrawl, apify actor, rss). The owner wants a corpus of 100,000+ short videos, refreshed continuously, split by niche, creator and cohort, so content plans are built from top performers. Reference competitor: topicfinder.ai. Hashtag and profile scraping are in scope but are not enough on their own; other discovery methods exist (keyword search, sound/audio pages, related-creator graphs, explore/for-you sampling, third-party trend datasets).

## What

A research pass that ends in a design doc and a cost model, not code. Answer:

- What topicfinder.ai (and 2-3 similar tools) collect, how they discover videos, how they define cohorts and "outlier", and what they show the user.
- Which discovery methods exist per platform (TikTok, Instagram Reels, YouTube Shorts) and which metrics each exposes publicly (views, likes, comments, shares, saves; post date; creator follower count).
- Cost and throughput per 1,000 videos for each method (Apify actors, own Playwright, yt-dlp, official APIs), plus rate limits and ToS risk.
- The outlier definition: deviation from the creator's rolling median per metric, normalized by video age.
- Cohort taxonomy: niche, format, hook type, length band, creator size band.
- Storage: SQLite tables under the `.ralphy` data root (domain store), what is kept per video (metadata, metrics history, transcript, digest from #557) vs. fetched lazily.

## Why it matters

Content plans "based on top performers" are only as good as the corpus. Without scale and freshness the agent copies whatever it happened to scrape.

## Scope / acceptance

- `docs/research/trend-corpus.md`: competitor teardown, method matrix (method x platform x metrics x cost/1k x ToS risk), outlier formula, cohort taxonomy, storage schema sketch, refresh cadence proposal.
- A cost estimate for 100k initial + daily refresh, with the cheapest viable mix.
- A measured sample: 1,000 videos from one niche through the cheapest method, with real cost and wall time recorded.
- #556 sharpened from the findings before it starts.

## Notes

- Sequence before #556. Feeds #557 (digest per video) and #558 (benchmarks).
- Keys only through registered connectors (AGENTS.md invariant 1).
