# Concept doc + "author a universe rubric" guide

> **Status:** done — 2026-06-18
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** low
> **Category:** docs

## Context

The per-workspace custom-evaluator framework (#468–#474) needs documentation so future universes can adopt it without re-deriving the design.

## What

Write a concept doc (the per-workspace custom-evaluator framework + the stage-gated studio) and a how-to for authoring a workspace rubric (`STYLE_LOCK.md` + `evaluators.json` + `metrics-benchmarks.json`), using Silent Hill as the worked example.

## Why it matters

The framework is only reusable if the next universe can follow a guide; otherwise it stays Silent-Hill tribal knowledge.

## Scope / acceptance

- A `docs/` concept page covering the framework, the 6 generic criteria/check-types, and the stage-gated studio flow.
- An "author a universe rubric" guide with the Silent Hill instance (#471) as the worked example.
- English-only on disk. Cross-link from the workspace section of `CLAUDE.md` / `AGENTS.md`.
- Run `lint:docs-links` after; if external links are added, run the external probe.

## Dependencies and linked work

- Framework #468–#474; instance #471.
- The Cyrillic CI gate is already tracked as #465 — reference it, do not re-file.

## Notes

- Docs only; no code. Low-risk, can land late in the sequence.
