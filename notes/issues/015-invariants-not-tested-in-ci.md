# AGENTS.md hard invariants not enforced by CI tests

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** quality-gate

## Context

AGENTS.md lists 15 hard invariants ("the only entry-point is `ralphy`", "append-only on generations", "no FAL/Vercel/OpenAI direct", etc). Most are doc-only — no CI test enforces them. Multiple postmortems land on the same finding: "the invariant reads like enforcement but the code disagrees."

## What

- Auto-version on regen (invariant #14) — not enforced for `video | music | voiceover | index.html`. See issue 004.
- `ralphy render <id>` is the only render path (invariant #2) — `bunx hyperframes render` works directly. See issue 009.
- "All media via `cli/lib/providers/media.ts`" — multiple postmortems show raw `ffmpeg` / `curl` reaching for what should be a verb. See issues 011, 012, 013.

## Why it matters

When the doc and the code drift, agents (and humans) trust the doc and act on a wrong premise. The invariant text becomes load-bearing for behavior it doesn't actually constrain.

## Suggested fix

- New `cli/test/invariants/` directory, one test per filesystem-touching invariant:
  - `append-only.test.ts` — regen a slot twice, assert v1 still on disk + v2 alongside.
  - `single-entry.test.ts` — assert `bunx hyperframes render` is gated or wrapped.
  - `manifest-completeness.test.ts` — after `generate`, assert a `generations.jsonl` row exists.
  - `index-html-preserved.test.ts` — assert HF authoring writes `compositions/v<N>.html` before overwrite.
- Add a "Tested by:" line to every invariant in AGENTS.md, linking to the test file.
- Wire `bun test cli/test/invariants/` into CI as a separate job.

## Sources

- `workspace/projects/kbo-broadcast-001/postmortem/05-workflow-fixes.md` — Finding A
- `workspace/projects/openrouter-ship-001/postmortem/05-workflow-fixes.md` — Fix 1 "aspirational not actual"
- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — Finding C
