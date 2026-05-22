# Developer notes

Free-form workspace for ideas, found issues, and informal design discussion that hasn't yet earned a task file under `roadmap/todo/`.

The split:

| Folder | What goes here | Lifecycle |
|---|---|---|
| `notes/ideas/` | Proposed features, refactors, dependency swaps. One file per idea, numbered prefix. | Mature → promoted to a `roadmap/todo/XX-YY-ZZ-<slug>.md` task file. |
| `notes/issues/` | Known bugs, gaps, surprises. Stuff we noticed but didn't fix in the same session. | Resolved → delete. Promoted to a roadmap task → delete after the task file lands. |
| `notes/decisions/` | Informal design discussions. Formal `D-NN` decisions still belong in the matching `roadmap/<NN-slug>/OPEN-QUESTIONS.md` decision log. | Promoted into `OPEN-QUESTIONS.md` as a decision entry → delete here. |

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

Keep notes short — under ~300 words. If a note grows past that, it's ready to become a roadmap task file.

## Promoting to roadmap

When a note matures, convert it into a roadmap task file:

1. Pick the right category folder (`roadmap/XX-<slug>/`) and the next free `XX.YY.ZZ` ID — see [`roadmap/CONVENTIONS.md`](../roadmap/CONVENTIONS.md).
2. Create `roadmap/todo/XX-YY-ZZ-<slug>.md` with frontmatter (`id`, `status: todo`, `v1_0`, `category`, `topic`, `title`) and concrete acceptance criteria. Copy the relevant body from the note.
3. If a non-trivial trade-off was made, add a `D-NN` entry to `roadmap/XX-<slug>/OPEN-QUESTIONS.md`.
4. Delete the note from `notes/` (git history preserves the rationale).

Do not let a note live in both places — `roadmap/` is the source of truth once a thing is committed to.
