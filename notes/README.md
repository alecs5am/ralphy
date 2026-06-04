# Developer notes

Free-form workspace for ideas, found issues, and informal design discussion that hasn't yet earned a task file under `roadmap/todo/`.

The split:

| Folder | What goes here | Lifecycle |
|---|---|---|
| `notes/ideas/` | Proposed features, refactors, dependency swaps. One file per idea, numbered prefix. | Mature → promoted to a `roadmap/todo/XX-YY-ZZ-<slug>.md` task file. |
| `notes/issues/` | Known bugs, gaps, surprises. Stuff we noticed but didn't fix in the same session. | Resolved → move to `notes/issues/done/`. Superseded / won't-do → move to `notes/issues/deprecated/`. Promoted to a roadmap task → move to `done/` once the task file lands. (See [Issues folder layout](#issues-folder-layout).) |
| `notes/decisions/` | Informal design discussions. Formal `D-NN` decisions still belong in the matching `roadmap/<NN-slug>/OPEN-QUESTIONS.md` decision log. | Promoted into `OPEN-QUESTIONS.md` as a decision entry → delete here. |

## Issues folder layout

`notes/issues/` is **status-by-folder**, so the active backlog is visually separated from everything that's been dealt with:

```
notes/issues/
  NNN-slug.md        ← ACTIVE work only (flat top-level = the live backlog)
  done/              ← resolved or promoted-and-landed issues
  deprecated/        ← superseded / won't-do / obsolete issues
```

Rules:

- **The flat top level of `notes/issues/` is the live backlog** — nothing else. To see open work, read the top-level files (`fd -d 1 -e md . notes/issues`); ignore the subfolders.
- **An issue keeps its `> **Status:**` blockquote line** even after it moves. The line and the folder must agree: a file in `done/` says `> **Status:** done — <date>`; a file in `deprecated/` says `> **Status:** SUPERSEDED by #NNN` (or `dropped (<reason>)`); a top-level file says `todo` / `exploring` / `issue` / a mitigation note. The folder is the fast signal; the line carries the *why*.
- **Move, don't delete.** Resolving an issue `git mv`s it into `done/`; abandoning one `git mv`s it into `deprecated/`. We keep the record so the next person sees what was already tried (git history alone is too easy to miss).
- **Numbering stays monotonic across ALL three locations.** The next free number is `max(active + done/ + deprecated/) + 1` — never reuse a number freed by a move. `fd -e md . notes/issues | rg -o '[0-9]{3}' | sort -n | tail -1` gives the current max.
- `ideas/` and `decisions/` stay flat (they're promoted/dropped, not "done"); only `issues/` has the `done/` + `deprecated/` split.

## Naming

```
notes/ideas/001-short-slug.md
notes/issues/001-short-slug.md        (active)
notes/issues/done/NNN-short-slug.md
notes/issues/deprecated/NNN-short-slug.md
notes/decisions/001-short-slug.md
```

Number the prefix so files sort by birth order. Slugs are kebab-case. The number is monotonic — for `issues/` count across active + `done/` + `deprecated/` (see [Issues folder layout](#issues-folder-layout)); for `ideas/` / `decisions/` pick `ls notes/ideas/ | tail -1` and increment.

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
