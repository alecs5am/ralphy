# Instagram Reels source for the trend corpus

> **Status:** todo (additional, non-blocking)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** medium
> **Category:** trend-watch / sources

## Context

The corpus (#556, #576) runs on TikTok and YouTube only. The owner asked for Instagram as an additional task that blocks nothing. Options from the #555 research: the official Graph API Business Discovery (free; needs a Meta app and an Instagram professional account owned by the owner; returns followers and per-media likes, comments and views for other professional accounts), or Apify `instagram-reel-scraper` (about $2.30 per 1,000 reels, behind the existing connector and a spend cap).

## What

- Business Discovery source behind a registered connector (`INSTAGRAM_*` credential, AGENTS.md invariant 1): creator listing by username, per-reel metrics, snapshot checkpoints at the #556 cadence; circuit breaker and rate-limit handling.
- Apify path stays behind `--paid` with a daily cap (already wired in #556).
- Seed Instagram handles from cross-platform links of kept TikTok / YouTube creators (bio links, same-name handles), then the #576 relevance gate.

## Scope / acceptance

- With the owner's credential configured, one niche (psychology EN) gets at least 100 kept Instagram creators with scored reels; without it, the source reports "not configured" and nothing fails.
- Tests on recorded fixtures; no paid run without a configured cap.
