# Postmortem distillation into memory proposals

> **Status:** done — 2026-06-11
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

## Distill-prompt hygiene (from the hermes-agent study, 2026-06-11)

Fold these rules into the distill system prompt — they are the difference
between compounding craft and self-poisoning memory (source:
`hermes-agent/agent/background_review.py` review prompts):

- **DO NOT capture:** (a) environment-dependent failures (missing binary,
  missing key, unconfigured dep — the user fixes those, they are not durable
  rules); (b) negative claims about tools/models ("X is broken" hardens into
  refusals cited months after the fix); (c) transient errors that resolved —
  if a retry worked, the lesson is the retry pattern, not the failure;
  (d) one-off task narratives.
- **Capture the FIX, not the failure** — when something failed from setup
  state, the entry is the install/config step, never "this doesn't work".
- **Prefer UPDATE over NEW:** before proposing, search active entries
  (both tiers) for an overlapping rule; on overlap, propose a new VERSION of
  that slug (merging the lesson) instead of a near-duplicate sibling.
- **Route procedural knowledge out:** a lesson with an extractable reusable
  artifact (ffmpeg recipe, prompt technique, HF snippet) belongs in
  `guidelines/` / a skill / a template — flag it as `route: guideline` in the
  dry-run output instead of proposing a memory entry. Memory is for facts and
  failure-mode rules, not for how-to bodies.
- **Class-level slugs:** no project IDs, error strings, or session artifacts
  in slugs — if the name only makes sense for this project, it's a workspace
  client fact or it's not memory material.

## Notes

- Sequence after #112 (uses the store + propose/approve plumbing).
- Distillation is an LLM text call (cheap, not media) — still report cost in
  the JSON output like other gen verbs do via the gen-log where applicable.
- Hermes validates our user-approved staging shape: its write-approval gate
  stages memory writes with a pending id for explicit user approval.
