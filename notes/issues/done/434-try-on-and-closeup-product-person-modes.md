# Try-on and closeup-product-with-person modes

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

User-facing competitors expose try-on and closeup-with-person modes because they map cleanly to commerce workflows: apparel on a model, beauty product in hand, gadget used by a person, or accessory fit shots. Ralphy's taxonomy names these modes but needs execution detail.

## What

Add mode docs, route fixtures, and quality gates for `virtual-model-tryout` and `closeup-product-with-person`.

## Why it matters

These modes have high hallucination risk: identity drift, body/hand artifacts, product deformation, and unsafe claims. They need stricter refs and gates than a generic lifestyle image.

## Scope / acceptance

- Define required refs: product, model/person, fit/scale reference, and brand constraints.
- Specify when Soul ID / persistent identity work is required versus optional.
- Add hand/body/product fidelity checks.
- Add route fixtures for fashion, beauty, gadget, and accessory examples.
- Define refusal/escalation when the user asks for a real person without adequate refs.
- Link outputs to product fidelity and release readiness gates.

## Notes

- Related: #422, #426, and the identity consistency memories/playbooks.
