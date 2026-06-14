# Unit provenance graph

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

The desired Unit is not just an exported mp4 or PNG. It should be reproducible: which brief, refs, prompts, models, style locks, council decisions, eval reports, repair plans, and selected variants produced the final artifact. Several postmortems had to reconstruct this lineage manually from filenames and logs.

## What

Add a provenance graph for Units that records the production chain from user brief to final deliverable. The graph should be compact enough for `unit.json`, but rich enough for reruns, template extraction, debugging, and library publishing.

## Why it matters

Content-farm quality compounds only if winners can be reproduced and improved. Metadata-only Units are hard to audit, hard to remix, and hard to learn from.

## Scope / acceptance

- Extend `unit.json` or add a linked provenance artifact with nodes for brief, research facts, style lock, prompts, source refs, generated assets, renders, eval reports, council reports, repair plans, and final media.
- Record model ids, provider ids, costs, timestamps, and selected/rejected variant ids where available.
- Preserve append-only semantics: adding provenance never rewrites prior artifacts destructively.
- Update `ralphy unit create` to include provenance from project logs/manifests when present.
- Add tests with a fixture project containing multiple variants and a repair pass.
- Make templater/publish flows consume provenance when building public library entities.

## Notes

- Related: #414 Unit lifecycle, #056 templater, and the deprecated #063/#066 library model discussions.
