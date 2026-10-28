# Agent context hygiene: MODELS.md split, skill trims, bounded output

> **Status:** done — 2026-10-28 (MODELS.md 41k to 7k bytes as an index plus docs/models/*; `ralphy models show <id>`; seven largest skills trimmed 41%; compact ref pull / ref paths output)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** agent performance

## Context

From the #562 baseline: 257 tool outputs over 20k characters (about 2.2M tokens), 157 repeated reads (about 612k tokens), `MODELS.md` read 35 times (about 280k tokens). A median turn processes about 200k tokens of context, so every avoidable byte is paid many times.

## What

- Split `MODELS.md` into an index plus per-model sections; make skills call `ralphy models show <id>` instead of reading the file.
- Trim the largest skill bodies (art-director, editor, scenarist playbooks; `hyperframes`, `intake`, `seedance-prompts`, `humanizer`): move reference material into on-demand `references/`, and state a minimal post-compaction re-read set.
- Compact default output for `ref pull` and `ref paths`; add guidance to bound reads of files over 20k characters.

## Scope / acceptance

- `bun run lint:skills` passes; total SKILL.md bytes for the listed skills drop by at least 30% with no lost routing (lint:skill-routing green).
- `ralphy models show <id>` exists and is referenced by the skills.
- Before/after `session:report` comparison recorded in the baseline doc.
