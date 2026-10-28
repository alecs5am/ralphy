# Performance-linked eval: hit rate and a decision ledger

> **Status:** done — 2026-10-28 (`analytics import` from screenshot-read JSON, decision ledger via `unit decisions`, `analytics report` with hit rate and min-n, plan `ledgerEvidence`; no schema change)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / analytics / eval

## Context

The owner's point about motion graphics "affecting metrics" is broader: the agent must judge its own work by real outcomes and link them back to the framework it works by, so it stops doing bad or useless work. Analytics ingest (#507) and ROI (#544) exist; the flywheel (#457) exists. Missing: a way to feed metrics the owner provides as screenshots, and a link from outcomes to production decisions.

## What

- **Screenshot ingest:** `ralphy analytics import-screenshot <unit> <png...>` reads platform analytics screenshots through vision (`callLLM()`), extracts views, average watch time, completion / retention curve points, likes, comments, shares, saves, follows, and writes analytics records, confirming the parsed numbers with the user before saving.
- **Outcome metrics per workspace:** hit rate (share of units beating the workspace median, or a target), completion, average watch percentage, engagement rate, save and share rate; all against the workspace's own baseline and, where available, cohort baselines from #556.
- **Decision ledger:** every unit records the choices that produced it (format, template, hook type, structure, transitions, motion elements, caption preset, layout, models, length). Join ledger to outcomes and report which choices over- or under-perform, with sample sizes and no claims below a minimum n.
- Surface the result where decisions are made: intake and the production plan read the ledger summary.

## Scope / acceptance

- Import works on real screenshots from TikTok, Instagram and YouTube Studio (fixtures committed with personal data removed).
- `ralphy analytics report --workspace <ws>` prints hit rate and the decision-vs-outcome table.
- The production plan cites the ledger when it picks a choice with enough evidence.
- Tests for parsing, baselines and minimum-n behavior.

## Notes

- Cross-links #507, #544, #457. Consumed by #569 and #565 (caption pacing).
