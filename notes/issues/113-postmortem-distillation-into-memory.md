# Postmortem distillation into memory proposals

> **Status:** todo
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

Promoted from idea 013. The `postmortem` skill writes 7-file sets under
`<project>/postmortem/` that nothing re-reads automatically — lessons die in
the project dir. Decision 2026-06-11: ingestion is **user-approved**, never
auto-written into active memory.

## What

Close the loop: after a postmortem set is written, distill its lessons into
memory **proposals** (`ralphy memory propose`, from #112) that the user
reviews via `ralphy memory approve`.

Two parts:

1. **CLI:** `ralphy memory distill <project-id>` — read the project's
   `postmortem/` set (lessons-learned + workflow-fixes files), extract
   candidate rules via `callLLM()` (`cli/lib/providers/llm.ts`), classify each
   by tier (global craft/model/tooling vs workspace client/style) and write
   them into the matching `proposed/` staging with `source:` provenance
   pointing at the project + postmortem file.
2. **Skill:** extend `.agents/skills/postmortem/SKILL.md` with a final step —
   run the distill verb, then surface the proposals to the user for
   approve/reject. The skill never auto-approves.

## Scope / acceptance

1. `ralphy memory distill <project-id> [--dry-run]`; dry-run prints candidates
   without writing. Each candidate body carries rule / **Why:** /
   **How to apply:** / **Does NOT apply to:** (mandatory).
2. Idempotent re-run: same lesson re-distilled → same slug, auto-version in
   `proposed/`, never a silent overwrite.
3. LLM call goes through `callLLM()` only (invariant #1); no media spend.
4. Unit test with a fixture postmortem set; LLM mocked.
5. Postmortem skill body updated; `lint:skills` green; regen CLI surface/docs.

## Notes

- Sequence after #112 (uses the store + propose/approve plumbing).
- Distillation is an LLM text call (cheap, not media) — still report cost in
  the JSON output like other gen verbs do via the gen-log where applicable.
