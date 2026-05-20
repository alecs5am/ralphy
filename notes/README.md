# Developer notes

Free-form workspace for ideas, found issues, and informal design discussion that hasn't yet earned a row in `roadmap/<NN-category>/SPEC.md`.

The split:

| Folder | What goes here | Lifecycle |
|---|---|---|
| `notes/ideas/` | Proposed features, refactors, dependency swaps. One file per idea, numbered prefix. | Mature → promoted to a `roadmap/<cat>/SPEC.md` row. |
| `notes/issues/` | Known bugs, gaps, surprises. Stuff we noticed but didn't fix in the same session. | Resolved → delete. Promoted to a SPEC row → delete after the row lands. |
| `notes/decisions/` | Informal design discussions. Formal D-NN decisions still belong inside the matching SPEC.md. | Promoted into a SPEC.md as the rationale section → delete here. |

## Naming

```
notes/ideas/001-short-slug.md
notes/issues/001-short-slug.md
notes/decisions/001-short-slug.md
```

Number the prefix so files sort by birth order. Slugs are kebab-case. The number is monotonic per folder — pick `ls notes/ideas/ | tail -1` and increment.

## File shape

Every note has the same shape:

```markdown
# Short title

> **Status:** idea | exploring | promoted to SPEC <ref> | dropped (reason)
> **Filed:** 2026-05-20
> **Folder:** ideas | issues | decisions

## Context

Why this came up. Cite the conversation, the postmortem, the PR that surfaced it.

## What

The proposal / bug / decision in 3-5 sentences.

## Why it matters

Cost, UX impact, risk. Concrete.

## Notes

Open questions, references, alternatives considered. Bullet list.
```

Keep notes short — under ~300 words. If a note grows past that, it's ready to become a SPEC row.

## Promoting to SPEC

When a note matures, copy the essentials into the appropriate `roadmap/<NN-category>/SPEC.md`:

1. Add a new task row under the matching sub-section.
2. Add a Decision entry (`D-NN`) at the bottom of the SPEC if a non-trivial trade-off was made.
3. Delete the note from `notes/` (git history preserves the rationale).

Do not let a note live in both places — `roadmap/` is the source of truth once a thing is committed to.
