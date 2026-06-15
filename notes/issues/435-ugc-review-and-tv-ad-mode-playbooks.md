# UGC review and TV ad mode playbooks

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Ralphy has UGC craft overlays and cinematic tools, but `ugc-review` and `tv-ad` need explicit mode-level playbooks. They represent opposite ends of the commercial spectrum: trust-building creator review versus polished brand spot.

## What

Create playbooks and fixtures for `ugc-review` and `tv-ad`, including script structure, reference requirements, model stack, evaluation rubrics, and default repair patterns.

## Why it matters

Without separate modes, agents blend casual UGC and cinematic advertising into the same generic ad recipe. That produces content that is neither trustworthy nor premium.

## Scope / acceptance

- Add mode docs under `docs/playbooks/modes/`.
- Define UGC review beats: problem mirror, product proof, mannerisms, objection handling, and CTA.
- Define TV ad beats: brand idea, cinematic setup, product hero, proof, end card.
- Add route fixtures and production-plan fixtures.
- Add mode-specific eval criteria and council role emphasis.
- Cross-link existing `ugc-ad`, `ugc-unboxing`, and cinematic guidelines where relevant.

## Notes

- Related: #417 guideline coverage and #419 benchmarks.
