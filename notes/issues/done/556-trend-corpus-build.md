# Trend corpus build: ingest, refresh, outliers, cohorts

> **Status:** done — 2026-10-28 (migration 11, `ralphy trends`; real free run 16,507 videos from 381 creators in 9.6 min, 0 blocks; follow-ups in Not done)
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

## Build decisions (2026-10-28)

Recorded while implementing; they sharpen the Scope above where it was silent or inconsistent.

- **Migration 11 confirmed free** (`SCHEMA_VERSION` was 10). Tables as sketched, plus: `trend_watchlists.source` (the method that serves a seed); `trend_creators.{niche_method, region, last_posted_at, listing_failures, last_list_error}`; `trend_videos.{posted_at_source, region, aigc_label, in_listing, latest_views_precision, latest_source, outlier_detail_json, momentum}`. `in_listing` marks videos seen in their own creator's listing: only those are baseline members, and a video is scored only when its creator has been listed.
- **Snapshot key.** The sketch's PK `(video_id, checkpoint, source, as_of)` would let every refresh insert a row. The key is `(video_id, checkpoint, bucket_seq, source)`: `bucket_seq` is 0 for the fixed buckets, the month number for `monthly` (ages past 56 days; `d28` covers days 28-56), and the UTC day number for a new `undated` checkpoint (YouTube flat listings carry no post time). Insert is `INSERT OR IGNORE`, first sample wins, `latest_*` always moves forward.
- **Label key** is `(video_id, axis, taxonomy_version, method)` so a rule pre-label and a later LLM label coexist append-only. Effective label: manual > llm (confidence >= 0.6, not `unknown`) > rule > seed.
- **Digest link.** #557 writes bundle directories, not Documents, so `trend_video_digests` stores `ref_kind` (`bundle` | `document`) and `digest_ref` (a path relative to the data root, absolute paths rejected by a CHECK, or a `doc_` id). No import of #557 code. Verb: `ralphy trends link-digest <video> --ref <ref>`.
- **WITHOUT ROWID.** `cli/lib/store/verify.ts` and `cli/lib/migration/verify.ts` scanned every table with `SELECT rowid`; both now detect WITHOUT ROWID tables. The verifier's TEXT-column registry lists the nine new tables.
- **Hot creators** are creators on a watchlist of kind `creator` (explicitly watched) whose newest post is younger than 72 h, not every discovered creator (that would put most active TikTok creators on a 6 h cadence).
- **Circuit breaker.** A bot check, CAPTCHA, login wall, HTTP 429, or 403 trips a source immediately; empty bodies trip after 3 in a row (one empty listing is usually a private or empty account). A tripped source is skipped for 60 minutes by later runs (recorded in the Run Attempt response, shown by `trends status`). A blocked listing never counts against the creator. Creator failures back off 24 h per failure; three in a row, or a permanent one (no Shorts tab, private account), exclude the creator. Request budget per source per pass (`--budget`). yt-dlp runs with `--ignore-config` and refuses cookie, credential, and proxy flags.
- **YouTube without a key.** Channel Shorts tabs give rounded views and no post time, so those videos are stored `undated` and stay unscored. The existing registered connector (`cli/lib/providers/youtube-analytics.ts`, `YOUTUBE_API_KEY`) gained a 50-id `videos.list` call (`youtubeVideoDetails`) that dates videos, adds exact stats, resolves hashtag Shorts ids to channels, and drives the 30-day re-fetch; no new provider key. It was not exercised in the build run (no key configured). Hashtag Shorts pages carry no channel, so without the key those ids are counted as unresolved; channel seeds come from `/hashtag/<t>` and `ytsearchN:` instead.
- **Paid sources** (`apify-tiktok` via `clockworks/tiktok-scraper`, `apify-instagram` via `apify/instagram-reel-scraper` by profile and by reel URL at ages 1/3/7/14 days) need `--paid` and `--apify-daily-cap-usd`. The remaining daily budget per actor (sum of Run Attempt `cost_usd` on trend runs) shrinks the request, and the same cap goes to Apify as `maxItems` / `maxTotalChargeUsd` (new `apifyRunActorDetailed` in the connector). Not run.
- **Labels for the top list.** `trends top --by outlier` hides thin baselines by default (`--include-thin` shows them); thin and provisional scores carry no label. `under` is a views multiplier below 0.5.
- **LLM labels** (`--llm`, default off): batches of 25, closed label sets, `google/gemini-2.5-flash` through `callLLM()`. Not run in the build.
- **`ref scrape-trends`** is marked deprecated in `ralphy research --help` and the researcher skill references; its own help line in `cli/commands/ref.ts` was left alone because that file carries unrelated uncommitted #557 work. Follow-up: change that description to point at `ralphy trends`.
- **Portable export** carries all `trend_*` tables except the two baseline caches (tested). The package manifest is JSON capped at 64 MiB: the build run's 16.5k-video corpus exported as 51.5 MB (about 3.1 KB per video with snapshots and labels), so export stops with an explicit size error at roughly 21k videos; a 100k corpus needs a streamed table format in the portable package (follow-up).

## Not done here

- `docs/cli-surface.generated.md` regeneration (owner regenerates).
- Sound-page seeding (`--source tiktok-sound`) is implemented on the same XHR capture as Explore but was not exercised live.
- Maturity-curve refit is implemented (`trends score --refit`, monthly in `refresh`) but needs videos with a `d28` snapshot, so no refit exists yet.
- Outlier thresholds are the formula's; in the build run 9.5% of mature TikTok videos are `breakout` and 2.0% `outlier`, so the recalibration step (about 5% `outlier` per platform) is still open.
- YouTube Data API, Apify, and LLM paths are covered by tests with fakes only.
- Algrow / Virlo evaluation.

Build run numbers (16,507 videos, 381 creators, 0 blocks, 9.6 minutes of ingest, 252 s full refresh) and the 100k projection are in `docs/research/trend-corpus.md` under "Build run (#556)".
