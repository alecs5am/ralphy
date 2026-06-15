# Library QA and broken media checks

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

As the library becomes a source of templates, modes, benchmarks, and seed Units, broken media or incomplete metadata will directly harm agent routing and user trust.

## What

Add QA checks for library entities: media URLs, thumbnail availability, schema completeness, mode links, provenance, preview dimensions, and broken references.

## Why it matters

The library is becoming execution input, not only a gallery. Bad library records can misroute agents or make generated output unreproducible.

## Scope / acceptance

- Add a validation script for `landing/lib/library-v2/library.json`.
- Check media URLs or local mirrors where feasible.
- Check required fields for Units, Templates, Styles, Recipes, and Assets.
- Check mode/guideline/benchmark links resolve.
- Add a CI-friendly fast path and a slower external-media probe path.
- Produce actionable output grouped by entity id.

## Notes

- Related: #447 seed Units and #067 community uploads.
