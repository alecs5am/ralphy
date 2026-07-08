# Confirm the unverified publish-platform quota caps

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** low
> **Category:** publishing / operations / data-freshness

## Context

The #534 quota governor ships `PLATFORM_QUOTAS` in `cli/lib/publish/quota.ts`
as dated, sourced data. Two entries have a documented citation (youtube — the
YouTube Data API v3 10k/day unit budget; instagram — the Graph API 25-posts/24h
content-publishing limit). Four are marked `source: "unverified — needs
confirmation"` and set to a CONSERVATIVE floor so a big campaign paces rather
than 429s: `x` (17/24h), `tiktok` (15/24h), `devto` (10/day), `hashnode`
(20/day).

## What

Confirm each unverified cap against the platform's current published limit and
either cite the doc in the `source` string (moving it out of `unverified`) or
adjust the number. Refresh `verifiedOn` on every entry touched.

## Why it matters

`isQuotaStale` flags entries older than 180 days, but the `unverified` markers
are the sharper signal that the number is a guess. Getting the real caps in
lets the scheduler pace at the true limit instead of a conservative floor
(which reschedules publishes that could have gone out).

## Scope / acceptance

- Each of the four unverified platforms: cite the real limit in `source` or
  adjust the cap; bump `verifiedOn`.
- Where a platform genuinely publishes no documented number (e.g. Hashnode),
  say so explicitly in `source` and keep the conservative cap — that is a
  confirmed "no documented cap", not an unverified guess.
- No logic change — this is a data refresh of the table.

## Notes

- Discovered while landing #534. The table is the single source of truth; do
  not scatter caps into logic.
