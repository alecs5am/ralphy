# Claims and policy gate for commercial content

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Product and brand fidelity checks confirm whether output matches the product. A separate gate should check what the content claims: health, finance, performance, warranties, pricing, platform policies, testimonials, and prohibited comparative claims.

## What

Add a claims and policy gate for commercial modes. It should compare scripts, captions, on-screen text, and distribution copy against product facts and mode/platform restrictions.

## Why it matters

Invented or risky claims can make a polished Unit unusable. This should block before publishing, not show up as a soft note.

## Scope / acceptance

- Define claim categories and severity levels.
- Ingest product facts from research/bootstrap outputs.
- Check scenario text, prompts, rendered OCR text, captions, and distribution pack copy.
- Block high-risk unsupported claims unless user explicitly provides proof.
- Add fixtures for allowed, unsupported, and prohibited claims.
- Link the gate to product fidelity and release readiness scorecard.

## Notes

- Related: #422 product fidelity and #423 distribution pack.
