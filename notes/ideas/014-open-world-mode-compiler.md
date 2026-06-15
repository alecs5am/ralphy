# Open-world mode compiler

> **Status:** idea
> **Filed:** 2026-06-15
> **Folder:** ideas

## Context

The user accepted the Mode Compiler direction but called out a critical caveat: there will be content categories Ralphy does not know yet. A fixed taxonomy cannot become a ceiling.

## What

The mode compiler needs two paths. Known-mode path: map the brief to a supported content mode and emit a production contract. Open-world path: when the content type is unfamiliar, infer the closest media format, research the niche, create a provisional mode profile, ask only high-leverage questions, run with stricter checkpoints, and save the learning for possible mode promotion.

## Why it matters

The ideal Ralphy must produce any media content, not only preinstalled modes. Unknown content should degrade into structured discovery, not generic prompting or refusal.

## Notes

- Related issues: #418, #430, #432, #446.
- Output artifact idea: `provisional-mode.json` with inferred format, assumptions, refs required, research depth, risk, gates, and promotion notes.
- A provisional mode should never pretend to be fully supported; it carries stronger user checkpoints and postmortem capture.
