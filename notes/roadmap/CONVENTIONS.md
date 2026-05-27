# Roadmap Conventions

Mechanics of how this roadmap is structured, written, and kept current. Read once. Re-read when adding a category or changing the layout.

## Folder layout

```
roadmap/
  README.md            # master index + v1.0 ship criteria
  CONVENTIONS.md       # this file
  VALIDATION.md        # auto-generated link-health report
  todo/                # tasks not started: status [ ]
  doing/               # tasks in flight: status [~]
  done/                # tasks shipped:    status [x]
  cancelled/           # tasks dropped or superseded: status [x] (cancelled|dropped)
  XX-<slug>/           # one folder per category — keeps PRD + open questions
    PRD.md             # why, for whom, success metrics
    OPEN-QUESTIONS.md  # unresolved + ADR-style log of resolved decisions
```

**One file per task.** Each task lives as a single markdown file under exactly one of `todo/`, `doing/`, `done/`, `cancelled/`. Moving a file between folders **is** the status change — there is no separate index to keep in sync. Same shape as `notes/`.

**Filename:** `XX-YY-ZZ-<slug>.md` where `XX-YY-ZZ` is the stable task ID and the slug is a short kebab-case form of the title. The slug is allowed to drift over time; the ID never does.

## Numbering: `XX.YY.ZZ`

- **`XX`** — category. Two digits, zero-padded. Allocated once. Never renumbered, never reused.
- **`YY`** — topic within the category. Two digits.
- **`ZZ`** — individual task. Two digits.

Two digits everywhere so `01.02.03` sorts predictably in tables, in commit messages, and in greps. Always cite the full triplet — "let's fix `01.02.04`" is greppable, "let's fix the help thing" is not.

Topic grouping (`XX.YY`) is metadata stored in the task file's frontmatter (`topic: "XX.YY Topic Name"`). Topics don't have their own files in the new layout — they're a search axis, not a folder.

## Task file shape

```markdown
---
id: XX.YY.ZZ
status: todo            # | doing | done | cancelled
v1_0: yes               # | no | stretch | unspecified
category: XX-<slug>
topic: "XX.YY Topic Name"
title: "One-line task title without backticks"
---

# XX.YY.ZZ — <verbatim title with backticks etc>

**v1.0:** yes

**Acceptance criteria:**
- ...

**Implementation:** (only on `done` / `doing` — cite real paths with `../../` from repo root)

**Notes:** open questions, alternatives, follow-ups.
```

### Status values

| Value | Folder | Meaning |
|---|---|---|
| `todo` | `todo/` | Not started. Acceptance criteria should be concrete enough to start. |
| `doing` | `doing/` | In flight. The first commit that touches the task moves it to `doing/`. |
| `done` | `done/` | Shipped. Implementation block cites real code paths. |
| `cancelled` | `cancelled/` | Dropped or superseded. Body explains why and links to the replacement task if any. |

### `v1_0`

- `yes` — gates v1.0. Must ship before launch.
- `no` — post-v1.0.
- `stretch` — nice-to-have for v1.0; ship without if needed.
- `unspecified` — not yet decided.

### `OPEN-QUESTIONS.md` (per category)

Two sections.

**Top section — Open questions.**

```markdown
### Q-NN: <one-line question>
**Context:** what makes this hard to answer
**Options on the table:** A, B, C
**Blocking:** what tasks (`XX.YY.ZZ`) can't be sharpened until this resolves
**Owner:** whoever is supposed to drive a decision
```

Question IDs are `Q-NN` scoped per category, monotonically increasing, never reused.

**Bottom section — Decision log.**

```markdown
### D-NN: <decision title> (YYYY-MM-DD)
**Was:** Q-NN
**Decision:** what we chose
**Why:** the one or two reasons that closed it
**Consequences:** which task files updated as a result
```

Once a question becomes a decision, leave a stub in the open-questions section: `Q-NN: <title> → D-NN`.

## Style

- **English only.** All roadmap files are English. Gate: `rg --pcre2 '\p{Cyrillic}' roadmap/` must be empty.
- **No emojis.** They date badly and add noise to greps.
- **No "TBD".** Either say what you don't know (Open Questions) or leave the task out until you can name acceptance criteria.
- **No dates in task files.** v1.0 is feature-driven, not date-driven. Dates only appear in the decision log.
- **Cite, don't paraphrase.** Link to docs and code; don't inline copies.
- **`../../<path>` for repo-rooted references.** Task files live two levels deep (e.g. `roadmap/todo/...`), so `../../cli/commands/clone.ts` resolves to the repo root.
- **`../XX-<slug>/` for the task's own category PRD / OPEN-QUESTIONS.** A task in `roadmap/todo/01-02-03-foo.md` reaches its open-questions at `../01-cli/OPEN-QUESTIONS.md`.

## Workflow

### Add a new task

1. Pick the category folder for the topic. If none fits, pause — adding a 12th category is a separate conversation.
2. Pick the topic (`XX.YY`). If none fits, allocate the next free `YY`.
3. Allocate the next free `ZZ`.
4. Pick a kebab-case slug.
5. Create `roadmap/todo/XX-YY-ZZ-<slug>.md` with frontmatter (`status: todo`) and concrete acceptance criteria. Tasks without criteria go to `OPEN-QUESTIONS.md` first.

### Move a task between statuses

```bash
mv roadmap/todo/01-02-03-foo.md roadmap/doing/
# do the work
mv roadmap/doing/01-02-03-foo.md roadmap/done/
# update frontmatter status: and add **Implementation:** citing the code
```

The mover is responsible for syncing the frontmatter `status:` field with the new folder. `bun run scripts/validate-roadmap.ts` catches stale cross-references.

### Complete a task

1. Move to `done/`.
2. Set `status: done` in frontmatter.
3. Add `**Implementation:**` citing real code paths.
4. Same commit as the work landing.

### Cancel / supersede

1. Move to `cancelled/`.
2. Set `status: cancelled`.
3. Append a `**Resolution (YYYY-MM-DD):**` block.

### Resolve an open question

1. Move it to the decision log with a `D-NN` ID and today's date.
2. Leave a stub in open-questions pointing at the decision.
3. Touch any task files whose acceptance criteria were blocked. Task ID stays.
4. All in one commit.

### Add a category

Adding a 12th category is rare. Criteria:

- It's not a sub-topic of an existing category.
- It has at least three topics ready to write today.
- It has measurable success metrics distinct from existing categories.

If yes: allocate `12`, create `roadmap/12-<slug>/` with `PRD.md` and `OPEN-QUESTIONS.md`, file tasks under `roadmap/todo/12-...`. Update the master `README.md` table.

## Validation

`bun run scripts/validate-roadmap.ts` walks every task file in `done/`, `doing/`, and `cancelled/`, extracts every markdown link, and verifies that links pointing at repo paths still resolve. Output: `roadmap/VALIDATION.md`. Run after any cross-folder move or codebase refactor that renames files.

The validator is **structural only** — it checks that cited paths exist, not that the cited code still implements the stated acceptance criteria. Behavioural validation is the test suite (`bun test`).

## For AI agents picking up roadmap work

If a user says "let's work on `XX.YY.ZZ`" or "what's left in category `XX`":

1. `fd 'XX-YY-ZZ' roadmap/` to locate the task file (status is encoded in the parent folder).
2. Read the file. Read the category's `PRD.md` (`roadmap/XX-<slug>/PRD.md`) for framing.
3. If the task is in `todo/` and acceptance criteria are concrete — `mv` to `doing/`, flip frontmatter, start.
4. If criteria are vague or conflict with current code — stop and ask the user one question. Do not invent criteria.
5. If the task is blocked by an open question — point at the `Q-NN` and ask the user to decide.
6. Browse what's open in a category: `fd '^XX-' roadmap/todo/` and `fd '^XX-' roadmap/doing/`.
7. Browse a topic across statuses: `fd '^XX-YY-' roadmap/`.
