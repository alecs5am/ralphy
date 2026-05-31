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

- **Database** (relational) for the five content entities — `Unit`, `Template`,
  `Style`, `Recipe`, `Asset` (#063) — the `unit_block` composition join, `tags`, and
  (for #067) `users` / ownership. Must support search/filter over Units AND every block
  type, plus the per-axis provenance/applicable traversal.
- **Blob storage** for all media: Unit deliverables (1..N items each) AND the building
  blocks' reference media (Style example-refs, Asset master-shots, Recipe before/after),
  instead of committing derivatives to `landing/public/showcase/`. Landing reads via URLs.
- **API surface** the feed (#065) + Unit/block pages (#066) consume — query Units
  (filter by format/tag and by any block: style/template/recipe/asset, paginate),
  resolve a Unit's blocks (provenance + applicable), resolve a block's Units.

## Why it matters

- Unblocks everything downstream: the Units feed, M:N navigation, user uploads, and
  search at scale. Without a DB + blob store, none of #063/#065/#066/#067 is feasible.
- The committed-media approach already strains the repo (see the showcase re-encode /
  audio-mux churn this session); user uploads would make it untenable.

## Scope / acceptance

Infra **design doc** first (do not provision yet):

- DB + blob **decided: Supabase Postgres + S3** (project already provisioned). Doc the
  rationale + rough cost; the open-source repo ships the schema + a seed, not the data.
- Concrete schema for Unit / Template / Style / Recipe / Asset / unit_block / tags /
  users (align with #063 — all five entities, not just Unit+Template).
- Ingestion / seed path: migrate current `showcase.json` outputs → Units (with
  provenance links); seed Styles from the 38 vibe-style cookbooks + `guidelines/*`
  registers; seed Assets from the asset-pool kinds; seed Recipes from the analog-horror
  VFX/encode stack. The committed `templates/**` becomes the open-source seed.
- Search index strategy (Units + every block type; full-text + tag/format/block facets).
- Auth boundary for writes/uploads (links to #067).
- Where the service lives relative to the planned repo split (#059) — its own
  service repo, or part of landing's API routes? Decide.
- Migration/back-compat: can the static `buildLibraryIndex` path coexist during
  transition (read-through), or is it a hard cutover?

## Notes

- **Sequence: foundational with #063 — enables #065, #066, #067.**
- Related: #059 (repo split — ownership of this service), #054, #056.
- Keep plan-only this round per the user's "discuss with team first" stance.
