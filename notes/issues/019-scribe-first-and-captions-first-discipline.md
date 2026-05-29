# Editor playbook missing "scribe first / captions first" discipline

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** playbook

## Context

For any aligned-to-VO cut with caption overlays, the cheapest pipeline is: stitch VO → scribe VO → slice video to scribe word-timestamps → bake captions from the same scribe output. The editor playbook lists `ralphy generate captions` as one recipe among many. It doesn't say "do this FIRST, before writing any Remotion timing constants." Agents guess timings, re-iterate, and only discover the right workflow at iteration N.

## What

- `choose-your-guide-001`: 11-iteration VO sync battle that scribe-first would have collapsed to 1. Proposed as a new AGENTS.md invariant in workflow-fixes #6.
- `venom-bodywash-001`: 3 caption-timing iterations by eye-balling Kling pre-line breaths; user caught at turn 26 that timings were 1.0-1.4s off (workflow-fixes #8, Finding E).
- `noski-people-001`: Rule 6 — speech-aware trim from scribe timings.

## Why it matters

This is a multi-hour saver. Once the scribe word-timestamps are in JSON, all three downstream consumers (video trim, caption render, music duck-points) read from the same source of truth.

## Suggested fix

- New invariant in AGENTS.md: "When the cut has aligned-to-VO captions, scribe the stitched VO track first."
- New sub-doc `docs/playbooks/editor/vo-sync.md` with the reverse-areverse silenceremove + concat demuxer + scribe + word-timestamp pattern.
- New sub-doc `docs/playbooks/editor/captions.md`: "If composition has caption overlays, run `ralphy generate captions` on each scene VO BEFORE writing Remotion timing constants. Snap to word-level `startMs`."
- Surface `ralphy ref transcribe --file <path>` to accept arbitrary mp3 (currently requires faking a reference slug — `choose-your-guide-001` GAP-2).

## Sources

- `workspace/projects/choose-your-guide-001/postmortem/05-workflow-fixes.md` — #6
- `workspace/projects/choose-your-guide-001/postmortem/02-lessons.md` — full VO+caption sync section
- `workspace/projects/venom-bodywash-001/postmortem/05-workflow-fixes.md` — #8, Finding E
- `workspace/projects/noski-people-001/postmortem/02-lessons.md` — Rule 6
