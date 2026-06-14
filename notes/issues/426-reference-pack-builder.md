# Reference pack builder

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Recent postmortems converge on the same pattern: quality jumps when the agent builds a disciplined reference pack first. Flipper needed canonical product refs, Glitter Cream needed product and model super-originals, App Store packs needed sanitized competitor screenshots, and analog horror needed one approved style prototype before batch generation.

## What

Add a reference pack builder that gathers, normalizes, labels, and locks the refs a project will use: brand, product, model/person, style, benchmark, creator/source, music, and generated master refs.

## Why it matters

Reference quality controls generation quality. A project should not proceed to prompt fan-out until its required ref pack is present, sanitized, and named in a way downstream agents can reuse.

## Scope / acceptance

- Define a `REF_PACK.md` / `ref-pack.json` artifact with typed entries and source provenance.
- Support ref types: brand, product, model/person, style, benchmark, source-video, music, generated-master, and selected-prototype.
- Normalize paths into project `artifacts/refs/` or workspace shared refs, using existing path hygiene rules.
- Let production plans require specific ref types by mode.
- Add lock status for refs that should be reused verbatim across all downstream generation.
- Integrate with product/brand fidelity gate and Unit provenance.
- Add fixtures for product UGC, App Store image pack, and analog-horror style prototype flows.

## Notes

- Related: #416 research bootstrap, #408 style lock, #422 fidelity gate, and #420 provenance.
