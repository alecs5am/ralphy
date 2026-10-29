# 90-day freshness window and an adapt scorecard for references

> **Status:** todo (sequence after #588)
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
