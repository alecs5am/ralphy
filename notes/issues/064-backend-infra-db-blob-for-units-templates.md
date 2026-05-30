# Backend infra for units/templates at scale: database + blob storage

> **Status:** exploring (design-first / plan-only, like #059 — user discussing with team)
> **Filed:** 2026-05-31
> **Folder:** issues
> **Severity:** high (foundational infra)
> **Category:** infra / architecture

## Context

Design discussion 2026-05-31. The library today is a **build-time static index**:
`buildLibraryIndex()` reads committed `templates/**` + `landing/public/showcase/**`
files at `next build` and ships static HTML. That model cannot carry the next step —
a feed of tens of thousands of Units (#063), search over Units AND Templates, the M:N
join with provenance/applicable links, and **user-uploaded** content (#067). All of
those need writes, queries, and somewhere to put large media that isn't the git repo.

## What

Stand up real backend infra to move off the static-file model:

- **Database** (relational) for `Unit`, `Template`, the `unit_template` join, `tags`,
  and (for #067) `users` / ownership. Must support search/filter over both Units and
  Templates and the M:N traversal.
- **Blob storage** for Unit media (video/image), instead of committing derivatives to
  `landing/public/showcase/`. The landing reads media via URLs from the blob store.
- **API surface** the landing feed (#065) + Unit/Template pages (#066) consume —
  query Units (filter by format/tag/template, paginate), resolve a Unit's templates
  (provenance + applicable), resolve a Template's Units.

## Why it matters

- Unblocks everything downstream: the Units feed, M:N navigation, user uploads, and
  search at scale. Without a DB + blob store, none of #063/#065/#066/#067 is feasible.
- The committed-media approach already strains the repo (see the showcase re-encode /
  audio-mux churn this session); user uploads would make it untenable.

## Scope / acceptance

Infra **design doc** first (do not provision yet):

- Pick DB (e.g. Postgres) + blob (e.g. S3 / Cloudflare R2) with rationale + rough cost.
- Concrete schema for Unit / Template / unit_template / tags / users (align with #063).
- Ingestion / seed path: migrate current `showcase.json` outputs + `templates/**`
  into the DB + blob store (each output → Unit with a `produced` link).
- Search index strategy (units + templates; full-text + tag/format facets).
- Auth boundary for writes/uploads (links to #067).
- Where the service lives relative to the planned repo split (#059) — its own
  service repo, or part of landing's API routes? Decide.
- Migration/back-compat: can the static `buildLibraryIndex` path coexist during
  transition (read-through), or is it a hard cutover?

## Notes

- **Sequence: foundational with #063 — enables #065, #066, #067.**
- Related: #059 (repo split — ownership of this service), #054, #056.
- Keep plan-only this round per the user's "discuss with team first" stance.
