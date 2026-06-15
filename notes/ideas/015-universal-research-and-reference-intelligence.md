# Universal research and reference intelligence

> **Status:** idea
> **Filed:** 2026-06-15
> **Folder:** ideas

## Context

Every strong production run starts with context: product, brand, audience, competitors, references, platform conventions, and mode-specific benchmarks. Recent postmortems show the same failure mode repeatedly: weak or late references cause wasted generations.

## What

Ralphy should automatically build an intelligence pack before production: brand facts, product facts, claims to avoid, audience, competitor examples, style benchmarks, source videos, creator DNA, product masters, model/person refs, music references, and ref contact sheets. The pack should be typed, linted, and reused across all Units in a batch.

## Why it matters

Reference quality is the floor of output quality. A low-tech user should not have to know what refs are needed; the agent should discover, request, normalize, and lock them.

## Notes

- Related issues: #416, #419, #422, #426, #449.
- Open-world mode compiler should call this layer before making creative assumptions.
- Strong default: no large paid generation until the required ref pack is present or explicitly bypassed.
