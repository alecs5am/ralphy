# Product-shot and lifestyle-scene mode playbooks

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

#412 defines `product-shot` and `lifestyle-scene`, but current mode docs do not include first-class playbooks for these two high-frequency commercial modes. They are foundational for product ads, catalog visuals, and social creative packs.

## What

Create mode playbooks and fixtures for product-shot and lifestyle-scene workflows, including required refs, prompt structure, product fidelity gates, variant strategy, and output Unit shape.

## Why it matters

These modes are likely among the most common low-tech user requests. If they route to generic image generation, output quality will stay agent-dependent.

## Scope / acceptance

- Add mode docs under `docs/playbooks/modes/` for both modes.
- Specify required product/brand refs and when to ask for more.
- Define default model choices and prompt spine using current MODELS.md.
- Add mode fixtures for route selection and production-plan output.
- Link the modes to #422 product fidelity and #426 reference packs.
- Update any mode registry docs/tests required by the existing content-mode system.

## Notes

- This is an execution slice under the broader mode coverage work.
