# Roadmap Conventions

Mechanics of how this roadmap is structured, written, and kept current. Read once. Re-read when adding a category or restructuring.

## Folder layout

```
roadmap/
  README.md            # master index + v1.0 ship criteria (single source)
  CONVENTIONS.md       # this file
  XX-<slug>/           # one folder per category
    PRD.md             # why, for whom, success metrics
    SPEC.md              # what, with acceptance criteria + status markers
    OPEN-QUESTIONS.md  # unresolved + ADR-style log of resolved decisions
```

Folder slug: `XX-<kebab-case>` where `XX` is the two-digit category number padded with leading zero. Slug is the human label; the number is the stable identifier.

## Numbering: `XX.YY.ZZ`

- **`XX`** — category. Two digits, zero-padded. Allocated once. Never renumbered, never reused.
- **`YY`** — topic within the category. Two digits. Allocated in `SPEC.md` headings. Stable.
- **`ZZ`** — individual task. Two digits. Stable.

Why two digits everywhere: `01.02.03` sorts predictably in tables, in commit messages, in greps. Three-digit overflow is a future problem we'll cross by going to `XX.YY.ZZ.AA` if we ever need it.

Examples (made-up):

- `01.02.04` = CLI category, "Help system" topic, "Add example block to every front-stage verb's `--help`" task.
- `08.01.01` = Quality & Evaluation, "scoreScenario" topic, first task in that topic.

Always cite the full triplet when referring to a task in commits, chat, or other documents. "Let's fix `01.02.04`" is greppable. "Let's fix the help thing" isn't.

## File contents

### `PRD.md`

One file per category. Six sections, in this order:

```markdown
# <Category Name> — PRD

## Problem
What is broken or missing today. One paragraph. Cite real artifacts (file paths, commit hashes, user quotes) — not hypothetical pain.

## Users
Who is affected. Two columns where relevant: human user, AI agent. They have different needs.

## User stories
"As a <role>, I want <capability>, so that <outcome>." Keep to 5-10 stories. Each maps to one or more `SPEC.md` topics.

## Success metrics
Quantitative where possible. Soft metrics (e.g., "feels good") are red flags — replace with proxies (e.g., "time to first render", "support questions per week").

## Non-goals
What this category explicitly does NOT cover. Prevents scope-creep and clarifies the boundary with adjacent categories. Cross-link the category that owns each non-goal.

## v1.0 cut
Which topics from `SPEC.md` are gates for v1.0 and which are post-launch. Two short lists.
```

### `SPEC.md`

The actual work. Structure:

```markdown
# <Category Name> — SPEC

> Vision: one or two sentences on the desired end state.

## Scope
Bullet list of what's in. Mirror `PRD.md` non-goals as a "not in scope" sub-list.

## XX.YY <Topic Name>
One short paragraph framing the topic.

### XX.YY.ZZ <Task Name>  [status]
**v1.0**: yes | no | stretch
**Acceptance criteria:**
- Concrete, verifiable. Each bullet either passes or fails on inspection.
- "Looks better" is not a criterion. "Renders X scenes in <Y seconds" is.

**Notes / pointers:**
- File paths, related issues, prior art. Optional.
```

Status markers (always at the end of the heading, in square brackets):

| Marker | Meaning |
|---|---|
| `[ ]` | Todo. Not started. |
| `[~]` | In progress. Some code or doc exists; acceptance criteria not yet met. |
| `[x]` | Done. Acceptance criteria met, merged. |
| `[x] (cancelled — reason)` | Decided not to do. Reason mandatory. |
| `[x] (deferred — reason)` | Done in spirit but split out into a follow-up task. Reason mandatory; cite the follow-up's ID. |

The `v1.0` line marks gate items:

- **`v1.0: yes`** — must be `[x]` before v1.0 ships.
- **`v1.0: no`** — post-launch.
- **`v1.0: stretch`** — nice-to-have for v1.0; ship without if needed.

### `OPEN-QUESTIONS.md`

Two sections.

**Top section — Open questions.** Things we haven't decided yet. Each entry:

```markdown
### Q-NN: <one-line question>
**Context:** what makes this hard to answer
**Options on the table:** A, B, C
**Blocking:** what tasks (`XX.YY.ZZ`) can't be sharpened until this resolves
**Owner:** whoever is supposed to drive a decision (often the user)
```

Question IDs are `Q-NN` scoped per category, monotonically increasing, never reused.

**Bottom section — Decision log.** ADR-style entries for resolved questions:

```markdown
### D-NN: <decision title> (YYYY-MM-DD)
**Was:** Q-NN (link)
**Decision:** what we chose
**Why:** the one or two reasons that closed it
**Consequences:** what changed in `SPEC.md` as a result
```

Decision IDs are `D-NN` scoped per category. Once a question becomes a decision, leave a stub in the open-questions section: `Q-NN: <title> → D-NN`.

## Style

- **English only.** All roadmap files are English. Per-conversation Russian is fine; documents are English.
- **No emojis.** They date badly and add noise to greps.
- **No "TBD".** Either say what you don't know (Open Questions) or leave the task out until you can name acceptance criteria.
- **No promises about timing.** No dates in `SPEC.md`. v1.0 is feature-driven, not date-driven. Dates only appear in the decision log alongside resolved questions.
- **Cite, don't paraphrase.** When a task touches an existing doc (e.g. `docs/cli-ux-vision.md`), link to it. Don't copy its contents into `SPEC.md` — copies drift.

## Workflow

### Adding a new task

1. Pick the right category. If none fits, pause — adding a 12th category is a bigger conversation than adding a task.
2. Pick the right topic in `SPEC.md`. If none fits, add a new `XX.YY` heading; the next free `YY` is one past the current max.
3. Allocate the next free `ZZ` within that topic.
4. Write the task with status `[ ]` and a `v1.0` flag. Don't write tasks without acceptance criteria — those go to `OPEN-QUESTIONS.md` first.

### Completing a task

1. The same commit that lands the work flips `[ ]` → `[x]`.
2. If acceptance criteria changed during the work, update them in the same commit and note the change in the commit body.
3. If a follow-up emerged, file a new task in the same or adjacent category — never reopen a closed one.

### Resolving an open question

1. Move it to the decision log with a `D-NN` ID and today's date.
2. Leave the stub in the open-questions section pointing at the decision.
3. Update any `SPEC.md` tasks that were blocked, including their acceptance criteria.
4. All three changes in one commit.

### Adding a category

Adding a 12th category is rare and worth a short discussion before doing it. Criteria:

- It's not a sub-topic of an existing category.
- It has at least three topics ready to write today.
- It has measurable success metrics distinct from existing categories.

If yes: allocate `12`, create the folder, fill in `PRD.md` first, then `SPEC.md`. Update the master `README.md` table.

## For AI agents picking up roadmap work

If a user says "let's work on `XX.YY.ZZ`" or "what's left in category `XX`":

1. Read the category's `PRD.md` for framing.
2. Read the category's `SPEC.md` for the full topic + the specific task.
3. Read any task notes that point at code paths.
4. If the task is `[ ]` and acceptance criteria are concrete — start. The first thing you do is flip it to `[~]` in the same commit as your first real change.
5. If acceptance criteria are vague or conflict with current code — stop and ask the user one question. Do not invent criteria.
6. If the task is blocked by an open question — say so, point at the `Q-NN`, and ask the user to decide before proceeding.
