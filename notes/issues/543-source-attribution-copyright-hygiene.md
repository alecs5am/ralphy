# Source attribution and copyright hygiene for news content

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** high
> **Category:** compliance / publishing / content-farm

## Context

A news farm ingests third-party articles/posts (#500) and turns them into
videos, threads, and carousels. Two risks the reference gate (#3, named-entity
fabrication) does NOT cover: (1) attribution — reputable news content credits
its sources; an unattributed farm reads as a content scraper and erodes trust;
(2) copyright — lifting a source outlet's photos, footage, or logos into a
thumbnail or b-roll is an infringement/strike risk, and platform strikes can
kill the channel the farm depends on.

## What

An attribution + copyright-hygiene layer: source facts flow through to the
unit as citable provenance, and publish steps inject attribution into
descriptions/captions/frontmatter per a workspace policy (e.g. "Sources:" block
with links). A pre-publish hygiene check flags likely-infringing assets —
media that appears lifted from a source (a scraped image used directly rather
than a generated asset) — and blocks or routes to human review. All generated
visuals are the default; source media is quote/reference only under a
documented policy.

## Why it matters

A platform copyright strike is an extinction-level event for a channel — it
undoes all the farm's compounding work at once. Attribution is both an ethics/
trust baseline and, for GEO/SEO (#526), a linking asset. This is risk
management for the farm's most valuable, least-recoverable resource: the
accounts.

## Scope / acceptance

- Attribution provenance: carry source url/outlet/author on source-facts ->
  unit; a publish-time `attribution` policy (workspace config + bundle default)
  injects a Sources block into the description/caption/frontmatter per platform
  shape; off by an explicit opt-out only.
- Copyright hygiene check (deterministic where possible): flag units whose
  media provenance is a scraped/source asset rather than a generated/licensed
  one; flag source logos/watermarks detectable in inputs; block or route to
  the approval queue (#533) with the reason.
- Policy is data + documented, not hardcoded moralizing: the check enforces
  "generated assets by default, source media referenced not embedded" and
  surfaces decisions for the operator — it does not make legal judgments.
- Wire into the publish gate: a hygiene `fail` blocks auto-publish at any trust
  level (mirrors invariant #4); `warn` routes to review.
- `farm report` (#518) surfaces attribution coverage + hygiene flags.
- Tests: attribution injection per platform, opt-out, scraped-asset flag,
  clean-generated-asset pass, gate blocking at L1/L2.

## Notes

- Sequence after #500/#526/#533; the reference gate (#3) stays orthogonal
  (fabrication of named entities vs attribution/copyright of borrowed material).
- This does not turn the farm into a legal advisor; it enforces a conservative,
  documented content-provenance policy and surfaces the rest to the human.
