# 90-day freshness window and an adapt scorecard for references

> **Status:** done — 2026-10-30 (checkpoint: `--max-age-days` (default 90) on ingest, refresh, niche init, top, signals, series and the niche report; TikTok listings skip old videos, YouTube lists its 30 newest entries per channel, undated rows are stored `freshness-unknown`; analysis leaves older and undated rows out and counts them; adapt scorecard with `adapt | test | skip` and rule reasons on every reference row; rerun in `docs/research/references-psychology-en-2026-10-30.md`)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** high
> **Category:** trend-watch / references

## Context

Owner review 2026-10-30: reference tables included a 2023 and a 2024 video, and six of eight "top series" were 106 days to 4 years old. Old hits come from a different algorithm era and are not relevant. The owner also asked for more criteria in reference tables to decide whether to adapt. Today TikTok has 5,893 of 17,720 corpus videos older than 90 days, and about 244k YouTube videos are undated (flat listings carry no post date).

## What

1. **Collection cutoff (default 90 days, `--max-age-days`):** ingest, backfill and refresh skip videos posted before the window. TikTok listings carry timestamps; for YouTube, list only the newest entries per channel and date them (YouTube Data API when configured, #587; otherwise the existing small watch-page budget for Tier-1 candidates only). Undated videos are stored as `freshness-unknown` and never enter reference lists, signals or series references.
2. **Existing data:** videos older than the window are excluded from analysis queries and reports (no deletion; the corpus stays append-only), and the exclusion count is shown.
3. **Adapt scorecard** in `trends signals`, `trends series`, niche reports and any reference table the agent shows: post date and age (hot at 30 days or less, fresh up to 90), multiplier vs creator median and its niche percentile, views per follower, creator size band, replication (other creators with the same visual format, series lift), visual format, sponsored flag, transferable vs creator-bound, evidence quality (baseline n, dated, exact or rounded views), and a verdict `adapt | test | skip` with the reasons. The rules are explicit and documented; the verdict is reproducible from the row.

## Scope / acceptance

- A rerun of the psychology EN reference list and the series list contains only videos posted within 90 days, each with the full scorecard and verdict.
- Ingest and refresh tests prove old videos are skipped and undated ones are flagged.
- The agent skills that present references (researcher, intake, producer as relevant) say: fresh only, scorecard always.

## Checkpoint (2026-10-30)

**Built.**

- Window: `cli/lib/trends/freshness.ts` (pure): `DEFAULT_MAX_AGE_DAYS` 90, `HOT_AGE_DAYS` 30, `YOUTUBE_NEWEST_PER_CHANNEL` 30, `FRESHNESS_UNKNOWN`, the collection cutoff, window exclusion counts and window clamping.
- Collection: `listingPass` and `discoveryPass` (`cli/lib/trends/ingest.ts`) drop dated videos posted before the window after parsing (a pinned old TikTok post never stops the listing) and count `videosSkippedOld` / `videosFreshnessUnknown`; YouTube channel listings ask for at most the 30 newest entries (also `youtubeHandlePass` in niche init). Undated videos are written with `posted_at_source = 'freshness-unknown'` (`cli/lib/store/trends.ts`; no migration; a later dated sample replaces the flag). Dating stays on the existing paths: the YouTube Data API pass when configured, the watch-page budget for Tier-1 candidates (`niche init --youtube-date-budget`) and for newest series parts (`trends series --digest`).
- Analysis: the niche report analyses only dated main-group videos inside the window and reports `coverage.videos.excluded`; `trends signals` clamps `--since` / `--widen-since` and reports `coverage.excluded`; `trends series` lists fresh series only by default (`--include-stale` lists the rest with verdict skip; `--fresh-days` stays as an alias) and reports `coverage.excluded`; `trends top` clamps `--since`.
- Scorecard: `cli/lib/trends/scorecard.ts` (pure rules, version 1, markdown table) and `cli/lib/trends/reference-card.ts` (labels, series per video, fresh labeled formats, #577 contrast classes from every ledger of the niche, the multiplier population and same-creator repeat hits). Wired into `trends signals` (each signal row plus a `references` list ordered adapt, test, skip; `--markdown <new file>`), `trends series` (each row judged on its reference part: the most-viewed part inside the window, else the newest part) and the niche report (what to copy, top outliers, fresh series). Rules: `docs/research/trend-corpus.md`, "Freshness window and adapt scorecard (#590)".
- Skills: one rule each in `researcher` and `intake` (fresh only, scorecard always).

**Decisions.**

- Creator baselines and series lifts keep the whole stored history; the window decides which rows are references and analysis inputs, not a creator's median.
- A3 replication accepts repeat hits by the same creator (2+ other 3x+ videos inside the window) besides another creator's labeled series of the same visual format and a series lift, because TikTok rows have no visual format labels yet (frame digests blocked by the TikTok 403). A series row needs its own series lift >= 1.5x (K5) even when its reference part broke out. A multiplier from a thin baseline or a provisional age is shown but decides nothing.
- The existing corpus rows are not rewritten: undated rows read as freshness-unknown from `posted_at IS NULL`, and the stored flag appears as rows are written again.

**Runs (scratch corpus, existing data, no collection run).** Excluded corpus-wide: TikTok 5,893 of 17,720 videos older than 90 days; YouTube 243,726 of 244,087 undated. Psychology EN signals scope: 1,340 older, 17,528 undated; 25 references, all posted 5-30 days ago: adapt 9, test 14, skip 2. Series (five niches): 289 series, 112 stale and 126 freshness-unknown excluded, 51 fresh listed: adapt 3, test 10, skip 38.

**Not done.** No live re-ingest with the cutoff (the scratch corpus was rerun through analysis only). `docs/cli-surface.generated.md` not regenerated (new flags: `--max-age-days` on seven verbs, `trends series --include-stale`, `trends signals --markdown`).

