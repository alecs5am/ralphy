# Parallel `generate voiceover` calls can corrupt mp3 output

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

Firing multiple `ralphy generate voiceover` calls in parallel can write a corrupted mp3 (ffprobe shows empty duration; ElevenLabs Scribe rejects it as "File is corrupted"). Re-running serially fixes it. Likely cause: per-slot file write without lock, or overlapping writes to the same `voiceover/` dir.

## What

- `ralphy-vs-higgsfield-001`: #8 + workflow-fixes #5 — 3 parallel VO gens with `&` produced one unusable mp3.

## Why it matters

Parallel VO generation is the natural pattern for any multi-scene script. The current failure mode is silent — the file exists, the row appears in `generations.jsonl`, but downstream scribe and concat both fail.

## Suggested fix

- Per-slot file lock in `cli/lib/providers/media.ts → generateVoiceover()`. Or internal serialization for writes to the same `voiceover/` dir.
- After write, ffprobe the output and fail-fast if duration is 0 or codec unreadable. Retry once.
- Document the constraint in `docs/playbooks/art-director.md` until self-throttling is in place.

## Sources

- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/03-cli-issues.md` — #8
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/05-workflow-fixes.md` — #5
