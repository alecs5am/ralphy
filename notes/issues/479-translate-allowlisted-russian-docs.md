# Translate the allowlisted Russian content-library + audit docs to English

> **Status:** issue
> **Filed:** 2026-06-23
> **Folder:** issues

## Context

Wiring `lint:no-cyrillic` (#465) surfaced that the English-only-on-disk rule
had silently rotted across more than the two code sites #465 expected: 9
tracked files carried Cyrillic, ~530 lines total. The 2 code sites were
ASCII-escaped in #465; the remaining 7 are all-Russian content/audit prose that
need faithful translation, not a mechanical escape. They were added to the
`ALLOWLIST` in `scripts/lint-no-cyrillic.ts` so the new gate could start green
without blocking on a large translation, and so NEW Cyrillic in clean files
fails immediately.

## What

Translate each allowlisted file to English (faithful, not lossy — these are
agent-facing reference docs), then DELETE its path from the `ALLOWLIST` so the
gate tightens. Files (lines of Cyrillic):

- `docs/creative-library/personas/ARCHETYPES.md` (107)
- `docs/creative-library/hooks/HOOK_LIBRARY.md` (101)
- `docs/creative-library/scenes/SETTINGS.md` (52)
- `docs/creative-library/personas/SCHEMA.md` (20)
- `notes/audit-2026-05/audit.md` (187)
- `notes/audit-2026-05/chatgpt-research-rejected.md` (66)
- `notes/audit-2026-05/action-items.md` (1)

## Why it matters

`docs/creative-library/*` is agent-facing prompt-craft reference the scenarist
reads — Russian-only prose violates the hard English-only rule and is opaque to
non-Russian operators. The `notes/audit-2026-05/*` files are historical records;
lower-value but still bound by the rule. An allowlisted file is invisible to the
gate, so the longer it stays, the more the rule rots.

## Scope / acceptance

- Translate each file in place (English-only on disk; preserve meaning + any
  structured fields the docs encode).
- Remove each translated path from `ALLOWLIST` in `scripts/lint-no-cyrillic.ts`.
- `bun run lint:no-cyrillic` stays green with an empty (or smaller) allowlist.
- Split across commits if needed — the content-library docs are the priority;
  the audit notes can land separately.

## Notes

- The `docs/creative-library/*` set may overlap with content the agent rarely
  reads now — sanity-check relevance before a heavy translation; a stale doc may
  be a delete candidate rather than a translate candidate.
- Cross-links: #465 (the gate), `docs/developing-ralphy.md` (the rule).
