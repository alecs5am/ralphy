# Trend corpus build: ingest, refresh, outliers, cohorts

> **Status:** todo (research done in #555)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / trend-watch

## Context

Implementation half of #555. The design doc from #555 decides sources and schema; this issue builds it.

## What

Design source: `docs/research/trend-corpus.md` (sections named below). The corpus is creator-first: discovery surfaces only seed creators; a creator listing returns all of that creator's recent videos with metrics, and it is the unit of refresh.

- **Schema** (domain store migration 11, see "Storage schema sketch"): `trend_watchlists`, `trend_creators`, `trend_creator_snapshots`, `trend_videos`, `trend_metric_snapshots` (append-only, WITHOUT ROWID, one row per checkpoint bucket `h0-6 | h6-24 | d1-2 | d2-3 | d3-7 | d7-14 | d14-28 | d28 | monthly`), `trend_baselines` and `trend_cohort_baselines` (recomputable caches), `trend_cohort_labels` (versioned by `taxonomy_version`), `trend_video_digests` (links #557 Documents of kind `research`). New id prefixes `tcreator`, `tvideo`, `twatch`. The `trend_` prefix avoids the Publication-owned `metric_snapshots`. Scope: one corpus Workspace; every verb takes explicit `--workspace`. Every ingest, refresh, label, and score pass is a `runs` row (`trend.discover`, `trend.list`, `trend.snapshot`, `trend.label`, `trend.score`).
- **Sources** (see "Method matrix"):
  - TikTok: creator listing via yt-dlp `tiktokuser:<secUid>`, logged out, no cookies (primary); creator seeding from the logged-out Explore category feed and sound pages (Playwright, XHR capture); keyword and hashtag seeds through an Apify TikTok actor behind the existing `cli/lib/providers/apify.ts` connector, capped per day.
  - YouTube Shorts: flat browse listing of hashtag Shorts pages (discovery) and channel Shorts tabs (baselines, new-video detection, rounded views); exact stats and `publishedAt` through a new registered YouTube Data API connector (`YOUTUBE_API_KEY`, invariant #1; `videos.list`, 50 ids per call). Without a key, fall back to the Apify Shorts actor. Per-video watch-page calls are reserved for #557 digests.
  - Instagram Reels: `apify/instagram-reel-scraper` by profile for backfill and by reel URL for checkpoints at ages 1, 3, 7, and 14 days; new-reel detection from the logged-out profile reels tab, with an Apify profile scrape (limit 2) as fallback.
  - Retire or rewrite `ref scrape-trends` (its hashtag path returns 0 videos logged out).
- **Ingest**: upsert on `(workspace_id, platform, platform_video_id)` and `(workspace_id, platform, platform_creator_id)`; snapshot insert is `INSERT OR IGNORE` on the checkpoint key, with `latest_*` columns always updated; text truncated by code point.
- **Refresh** (see "Refresh cadence"): active creators daily, hot creators (a watched video younger than 72 h) every 6 h, inactive weekly, dormant monthly; monthly re-fetch of all stored YouTube Data API statistics (30-day rule); per-source request budgets and a circuit breaker that stops a method on the first bot check, CAPTCHA, or empty body and records it. No proxies, browser cookies, or CAPTCHA solving.
- **Outlier score** (see "Outlier formula"): project each snapshot to a 28-day value with a per-platform Weibull maturity curve (TikTok prior tau 54 h, k 1.15; YouTube and Instagram tau 96 h, k 1.0 until refit), take `ln(1 + value)`, compare with the leave-one-out median of the creator's last 30 same-format videos (MAD scale floored at 0.25, shrunk toward the cohort median with n0 = 5), and store the views multiplier, per-metric robust z, the platform-weighted composite, the label (`breakout`, `outlier`, `strong`, `normal`, `under`), the mode (`projected` or `same-age`), and flags (`thin`, `provisional`, `rising`). Monthly curve refit from longitudinal snapshots.
- **Cohort labels** (see "Cohort taxonomy"): deterministic length band, size band, language, region, audio, and ad flags; niche (two levels) at creator level from watchlist seed or one batched `callLLM()` call; format and hook pre-labeled by rules and title text, then by `callLLM()` (default `google/gemini-2.5-flash`), with labels below 0.6 confidence kept `unknown`.
- **Query verbs**: `ralphy trends top --workspace <ws> --niche <n> --since 14d --by outlier|views|momentum [--platform] [--format] [--size-band]`, `ralphy trends creator <handle|id>`, `ralphy trends watch add|list|remove`, `ralphy trends refresh [--due]`, `ralphy trends status` (counts, last run per source, breaker state, Apify spend to date).

## Scope / acceptance

- Corpus reaches 10,000 videos in one niche end-to-end (the #555 sample listed 9,591 TikTok videos from 179 creators in about 4 minutes with the free path), then the path to 100k+ is shown as a cost and time projection from real runs, checked against the #555 model: about $37 initial and $170-$230 per month at Apify Starter prices with Instagram, $15-$75 without.
- The refresh job runs headless, is idempotent (a second run in the same checkpoint bucket inserts no snapshot rows), and stops a source cleanly when its circuit breaker trips.
- Apify spend is capped per day per actor and reported by `ralphy trends status`; no paid call runs without a configured cap.
- `ralphy trends top` returns ranked videos with multiplier, composite score, label and flags, latest metrics with precision (`exact` or `rounded`), cohort labels, and a digest link when one exists. Scores are labeled as Ralphy's own, never as platform data.
- Baselines come only from creator listings, never from the discovery sample; a test proves a discovery-only video without a creator listing is not scored.
- `workspace.export` and `workspace.import` carry all `trend_*` tables except the two baseline caches (snapshot history cannot be re-scraped).
- Unit tests for the maturity curve, projection, baseline, shrinkage, z, composite, labels, momentum, and checkpoint bucketing; integration tests on committed fixtures for each source parser (TikTok listing and Explore XHR, YouTube flat listing and Data API, Instagram reel actor) and for the migration; `bun run lint` and `bun test` pass.
- `docs/cli-surface.generated.md` regenerated.

## Notes

- Sequence after #555. Content-plan work (intake, producer) reads from this.
- **Algrow (owner pointer, 2026-10-28).** YouTube-only service with an MCP server and an API: viral/outlier search, channel and thumbnail search, transcripts, daily channel refresh, 18.7M videos claimed. Credit-metered (165-535 credits/month at $25-$80), so it fits agent-side discovery and YouTube seed lists, not bulk ingest of 100k videos. Evaluate during the $1 trial: credits per call, fields returned, whether outlier multipliers match ours. If adopted for ingest, it goes behind a registered connector (`ALGROW_API_KEY`, AGENTS.md invariant 1); the MCP alone is fine for interactive research. TikTok and Instagram stay on the #555 mix. Virlo (TikTok, Shorts, Reels; API and MCP; from $34) is the cross-platform equivalent to evaluate alongside it.
