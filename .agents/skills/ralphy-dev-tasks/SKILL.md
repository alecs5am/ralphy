---
name: ralphy-dev-tasks
namespace: ralphy-dev
description: >-
  Manage Ralphy's own task system — the `notes/` capture inbox (`ideas/`, `issues/`, `decisions/`) and the committed `roadmap/` board (`todo/` → `doing/` → `done/` / `cancelled/`, one file per task, status = folder, IDs `XX.YY.ZZ`). Three jobs: (1) CAPTURE — turn a tagged thought into a correctly-shaped, correctly-placed note or roadmap task; (2) ITERATE — pick up open work (`notes/issues/`, `roadmap/doing/`, `roadmap/todo/`), do it, and move the file across statuses with frontmatter kept in sync; (3) COLLISION-CHECK — before filing anything new, search the inbox AND the board for an existing entity that already covers it, and update that instead of spawning a duplicate.
  USE WHEN the user types `/ralphy-dev-tasks`, says "log this idea", "file an issue", "add to the roadmap", "what should I work on next", "iterate on the issues", "what's open in <category>", "is there already a task for X", "promote this note", or drops a half-formed idea mid-dev-session for safekeeping.
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# ralphy-dev-tasks — the task-system manager for Ralphy dev work

This is a **maintainer** skill. It does not touch `workspace/projects/` or call media models. It curates the two-layer task system that tracks Ralphy's own development:

- **Inbox** — `notes/ideas/`, `notes/issues/`, `notes/decisions/`. Free-form, monotonic-numbered (`NNN-slug.md`), short-lived. The landing zone for anything not yet committed to.
- **Board** — `roadmap/{todo,doing,done,cancelled}/`. One file per task (`XX-YY-ZZ-slug.md`), the parent folder IS the status, IDs are stable forever. Per-category `roadmap/XX-slug/{PRD,OPEN-QUESTIONS}.md`.

The contracts live in [`notes/README.md`](../../../notes/README.md) and [`roadmap/CONVENTIONS.md`](../../../roadmap/CONVENTIONS.md). **Read both before your first capture or move in a session** — this skill is the operator, those files are the law.

## Trigger

Hard triggers (always act):
- User types `/ralphy-dev-tasks`.
- "log this / file this / capture this" + an idea, bug, or design thought about Ralphy itself.
- "add a task / add to the roadmap / promote this note".
- "what should I work on next" / "what's open in `<category>`" / "iterate on the issues".
- "is there already a task/idea for X" → run the collision check and report.

### ALSO FIRE (proactively, offer — don't auto-execute)
- The user surfaces a design idea mid-dev-session and moves on without filing it → offer to capture it before it's lost.
- A dev session just resolved a `notes/issues/` entry → offer to close it (update status or delete per lifecycle).
- A note in `notes/ideas/` has clearly matured (concrete acceptance criteria, no open questions) → offer to promote it to `roadmap/todo/`.

### DO NOT FIRE
- User is in **user mode** (making a video / operating the CLI on their behalf). This skill is dev-only.
- The thought is about a `workspace/projects/<id>` artifact → that's a project log / postmortem, not the task system.
- A formal `D-NN` decision is being recorded → that belongs in the category's `OPEN-QUESTIONS.md` decision log directly, not `notes/decisions/`.

## Hard invariants

1. **Collision-check before every create. No exceptions.** A new idea/issue/task is only created after the search in the Workflow's COLLISION-CHECK step comes back empty. If it overlaps an existing entity, update that entity instead. Proliferating near-duplicate entities is the exact failure this skill exists to prevent.
2. **English only on disk.** Every note, task, frontmatter field, and slug lands in English (per `docs/developing-ralphy.md`). The user may tag you in Russian — translate/paraphrase before writing. Gate before commit: `rg --pcre2 '\p{Cyrillic}' notes/ roadmap/` must be empty.
3. **One entity, one place.** A thing lives in EITHER the inbox OR the board, never both. Promoting a note to a roadmap task means deleting the note in the same commit (git history preserves the rationale).
4. **Status = folder.** Moving a task file between `roadmap/{todo,doing,done,cancelled}/` IS the status change. Always sync the frontmatter `status:` field in the same edit. Never leave a `done`-in-frontmatter file sitting in `todo/`.
5. **IDs are immutable, append-only.** `XX.YY.ZZ` is allocated once and never renumbered or reused. Categories (`XX`) are never renumbered. Allocate the next free `ZZ` within a topic; never recycle a cancelled task's ID.
6. **Never move to `done/` without verifying the work landed.** Cite real code paths in the `**Implementation:**` block (`../../<path>` from a task file). Then run `bun run scripts/validate-roadmap.ts` — it checks cited paths resolve and writes `roadmap/VALIDATION.md`.
7. **No new category without a conversation.** Adding a 12th… (currently 12 exist, 01–12) category is a deliberate decision per `CONVENTIONS.md` — pause and ask the user, don't allocate `13` unilaterally.
8. **Don't invent acceptance criteria.** If a thought isn't sharp enough for concrete criteria, it stays a `notes/ideas/` note. Vague-but-committed is the anti-pattern; the inbox exists precisely so the board stays shippable.

## Workflow

### CAPTURE — file a tagged thought
1. **Classify the thought:**
   - Proposed feature / refactor / dependency swap → `notes/ideas/`.
   - Known bug / gap / surprise we noticed but didn't fix → `notes/issues/`.
   - Informal design discussion (not yet a formal decision) → `notes/decisions/`.
   - Already scoped to one verb/file, criteria settled, starting now → skip the inbox, file straight to `roadmap/todo/` (or `doing/` if you start immediately).
2. **Run COLLISION-CHECK (below).** If a match exists, update it and stop.
3. **Allocate the number.** Inbox: `ls notes/<folder>/ | tail -1` and increment (monotonic per folder). Board: pick category `XX`, topic `YY`, next free `ZZ`.
4. **Write the file in the canonical shape** — note shape from `notes/README.md`, task shape from `CONVENTIONS.md`. Keep notes under ~300 words; if it's longer, it's already a task.
5. **Report** the path created and any near-misses the collision check surfaced.

### ITERATE — work the open queue
1. **Survey what's open:**
   - `eza notes/issues/` — unresolved bugs/gaps.
   - `fd '^XX-' roadmap/doing/` — in-flight for a category; `fd '^XX-' roadmap/todo/` — ready to pick up.
   - No category given → `ls roadmap/doing/` first (most likely stale), then ask which area.
2. **Read the task file + its category `PRD.md`** for framing before touching code.
3. **If criteria are concrete** → `mv` `todo/`→`doing/`, flip frontmatter `status: doing`, do the work.
4. **If criteria are vague or conflict with current code** → stop, ask the user exactly one question. Do not improvise criteria.
5. **On completion** → `mv` to `done/`, set `status: done`, add `**Implementation:**` with real paths, run the validator. All in the commit that makes it true.
6. **Resolved `notes/issues/` entry** → update its status line, or delete if fully closed (lifecycle in `notes/README.md`). Re-verify against the actual repo first — a "fixed" claim must be checked, not trusted (the way issue 003 was confirmed shipped before deletion).

### COLLISION-CHECK — the anti-duplication gate (run before every CAPTURE)
1. **Extract 2–4 keywords** from the thought (verb name, file, concept — e.g. `bytecode`, `cost forecast`, `smart-crop`).
2. **Search both layers:**
   ```bash
   rg -il '<keyword>' notes/ideas notes/issues notes/decisions roadmap/todo roadmap/doing roadmap/done roadmap/cancelled
   fd '<keyword>' roadmap notes        # slug-level match
   ```
3. **Triage each hit:**
   - **Same entity, open** → update it (append context, sharpen criteria). Do NOT create.
   - **Same entity, in `done/` or `cancelled/`** → the idea recurred. Read the resolution first; if it's genuinely new scope, file fresh and cross-link the prior file. If it's a re-litigation, point the user at the closed file.
   - **Adjacent but distinct** → file new, add a cross-link (`see XX.YY.ZZ` / `[[NNN-slug]]`) so the relationship is explicit.
   - **No hit** → safe to create.
4. **When unsure whether two things are "the same entity"** → surface both to the user with a one-line diff and let them decide. Better one question than two duplicate tasks.

## Cookbook

```bash
# Survey the whole board at a glance
for d in todo doing done cancelled; do printf "%-10s %s\n" "$d" "$(fd -e md . roadmap/$d | wc -l)"; done

# What's open in category 08 (quality & evaluation)
fd '^08-' roadmap/todo roadmap/doing

# Collision check before filing a "cost forecast" idea
rg -il 'cost.forecast|forecast' notes roadmap

# Next free idea number
ls notes/ideas/ | tail -1

# Promote a matured idea, then validate links
mv notes/ideas/00X-slug.md /tmp/   # after writing roadmap/todo/XX-YY-ZZ-slug.md
git rm notes/ideas/00X-slug.md
bun run scripts/validate-roadmap.ts

# Pre-commit gates
rg --pcre2 '\p{Cyrillic}' notes/ roadmap/   # must be empty
bun run lint:skills                          # if this skill itself was edited
```

## Outputs

- A correctly-placed, correctly-shaped note or task file (never a duplicate).
- Status moves reflected in BOTH the folder and the frontmatter.
- A short report per action: what was created/moved/closed, the path, and any near-collisions surfaced.
- `roadmap/VALIDATION.md` refreshed after any `done/` move or cross-folder shuffle.

## Note on layout drift

This skill targets the canonical board at repo-root `roadmap/` (what `scripts/validate-roadmap.ts`, `AGENTS.md`, and `docs/developing-ralphy.md` reference). If the board is ever relocated (e.g. under `notes/roadmap/`), update the paths in this skill's Workflow + Cookbook and re-point the validator in the same change — don't run against two copies.
