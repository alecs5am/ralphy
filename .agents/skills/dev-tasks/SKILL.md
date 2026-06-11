---
name: dev-tasks
namespace: maintainer
description: >-
  Manage Ralphy's `notes/` capture inbox (`ideas/`, `issues/`, `decisions/`) — the only dev tracker for Ralphy itself; there is no separate roadmap board. Two jobs: (1) CAPTURE — turn a tagged thought into a correctly-shaped, correctly-placed note (an idea, an issue, or a decision); (2) COLLISION-CHECK — before filing anything new, search the inbox for an existing entity that already covers it, and update that instead of spawning a duplicate. For the `notes/issues/` backlog itself — decomposing a brain-dump into issues, executing them, moving them across `done/`/`deprecated/` — defer to the `dev-issues` skill (filing/shaping) and `dev-loop` (execution); this skill keeps `ideas/` + `decisions/` capture plus the cross-inbox collision check.
  USE WHEN the user types `/dev-tasks`, says "log this idea", "file a note", "capture this", "record this decision", "what's in the inbox", "is there already a note/idea for X", "promote this note", or drops a half-formed idea mid-dev-session for safekeeping.
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# dev-tasks — the capture-inbox manager for Ralphy dev work

This is a **maintainer** skill. It does not touch `.ralphy/workspaces/<ws>/projects/` or call media models. It curates the `notes/` capture inbox that tracks Ralphy's own development. **`notes/` is the only tracker — there is no separate roadmap board.**

- **Inbox** — `notes/ideas/`, `notes/issues/`, `notes/decisions/`. Free-form, monotonic-numbered (`NNN-slug.md`). The landing zone for any dev thought.
- **`notes/issues/` is the live backlog**, status-by-folder: flat top level = active, `done/` = resolved/landed, `deprecated/` = superseded/won't-do.

The contract lives in [`notes/README.md`](../../../notes/README.md). **Read it before your first capture or move in a session** — this skill is the operator, that file is the law.

## Division of labor with `dev-issues` / `dev-loop`

- **This skill (`dev-tasks`)** owns `ideas/` + `decisions/` capture and the cross-inbox collision check.
- **`dev-issues`** owns the `notes/issues/` backlog: decomposing a brain-dump into well-shaped issue files, shaping them, filing/updating them. Read [`.agents/skills/dev-issues/SKILL.md`](../dev-issues/SKILL.md) before doing any non-trivial issue work — don't duplicate its job here.
- **`dev-loop`** owns issue *execution* (pick → implement → move to `done/`).

When a captured idea matures into something actionable, promote it into a `notes/issues/` item (per `notes/README.md`) and hand the shaping/execution to `dev-issues` / `dev-loop`.

## Trigger

Hard triggers (always act):
- User types `/dev-tasks`.
- "log this / file this / capture this" + an idea, bug, or design thought about Ralphy itself.
- "record this decision" / "promote this note".
- "what's in the inbox" / "what's open".
- "is there already a note/idea for X" → run the collision check and report.

### ALSO FIRE (proactively, offer — don't auto-execute)
- The user surfaces a design idea mid-dev-session and moves on without filing it → offer to capture it before it's lost.
- A note in `notes/ideas/` has clearly matured (concrete acceptance criteria, no open questions) → offer to promote it into a `notes/issues/` item.

### DO NOT FIRE
- User is in **user mode** (making a video / operating the CLI on their behalf). This skill is dev-only.
- The thought is about a `.ralphy/workspaces/<ws>/projects/<id>` artifact → that's a project log / postmortem, not the inbox.
- A long unstructured brain-dump the user wants decomposed into many issues → that's `dev-issues`.
- Execute an open issue → that's `dev-loop`.

## Hard invariants

1. **Collision-check before every create. No exceptions.** A new idea/issue/decision is only created after the COLLISION-CHECK step comes back empty. If it overlaps an existing entity, update that entity instead. Proliferating near-duplicate entities is the exact failure this skill exists to prevent.
2. **English only on disk.** Every note, frontmatter field, and slug lands in English (per `docs/developing-ralphy.md`). The user may tag you in Russian — translate/paraphrase before writing. Gate before commit: `rg --pcre2 '\p{Cyrillic}' notes/` must be empty.
3. **One entity, one place.** A thing lives in exactly one inbox folder. Promoting an idea to an issue means deleting the idea note in the same commit (git history preserves the rationale).
4. **Numbering is monotonic.** `NNN` is allocated once and never renumbered or reused. For `notes/issues/` count across active + `done/` + `deprecated/`; never reuse a number freed by a move.
5. **`notes/issues/` status = folder.** Resolving an issue `git mv`s it into `done/`; abandoning one `git mv`s it into `deprecated/`. Always sync the `> **Status:**` line with the folder in the same edit. New active issues are filed at the flat top level only.
6. **Don't invent acceptance criteria.** If a thought isn't sharp enough for concrete criteria, it stays a `notes/ideas/` note. The inbox exists precisely so the backlog stays executable.

## Workflow

### CAPTURE — file a tagged thought
1. **Classify the thought:**
   - Proposed feature / refactor / dependency swap, not yet scoped → `notes/ideas/`.
   - Known bug / gap / surprise, or a scoped actionable change → `notes/issues/` (flat top level). For a multi-item brain-dump, hand off to `dev-issues`.
   - Informal design discussion (not yet a settled decision) → `notes/decisions/`.
2. **Run COLLISION-CHECK (below).** If a match exists, update it and stop.
3. **Allocate the number.** `ls notes/<folder>/ | tail -1` and increment (monotonic per folder; for `issues/` count across active + `done/` + `deprecated/`).
4. **Write the file in the canonical shape** — note shape from `notes/README.md`. Keep notes under ~300 words; if it's longer and actionable, it's already an issue (file via `dev-issues` shape, with a `## Scope / acceptance` section).
5. **Report** the path created and any near-misses the collision check surfaced.

### COLLISION-CHECK — the anti-duplication gate (run before every CAPTURE)
1. **Extract 2–4 keywords** from the thought (verb name, file, concept — e.g. `bytecode`, `cost forecast`, `smart-crop`).
2. **Search the inbox (all of it, including the issues archive):**
   ```bash
   rg -il '<keyword>' notes/ideas notes/issues notes/decisions
   fd '<keyword>' notes        # slug-level match
   ```
3. **Triage each hit:**
   - **Same entity, open** → update it (append context, sharpen criteria). Do NOT create.
   - **Same entity, in `notes/issues/done/` or `deprecated/`** → the idea recurred. Read the resolution first; if it's genuinely new scope, file fresh and cross-link the prior file. If it's a re-litigation, point the user at the closed file.
   - **Adjacent but distinct** → file new, add a cross-link (`see #NNN` / `[[NNN-slug]]`) so the relationship is explicit.
   - **No hit** → safe to create.
4. **When unsure whether two things are "the same entity"** → surface both to the user with a one-line diff and let them decide. Better one question than two duplicate notes.

## Cookbook

```bash
# Survey the inbox at a glance
for d in ideas issues decisions; do printf "%-10s %s\n" "$d" "$(fd -e md -d 1 . notes/$d | wc -l)"; done

# Active issues only (flat top level — the live backlog)
fd -d 1 -e md . notes/issues

# Collision check before filing a "cost forecast" idea
rg -il 'cost.forecast|forecast' notes

# Next free issue number (monotonic across active + done/ + deprecated/)
fd -e md . notes/issues | rg -o '[0-9]{3}' | sort -n | tail -1

# Next free idea number
ls notes/ideas/ | tail -1

# Pre-commit gates
rg --pcre2 '\p{Cyrillic}' notes/   # must be empty
bun run lint:skills                # if this skill itself was edited
```

## Outputs

- A correctly-placed, correctly-shaped note (never a duplicate).
- For `notes/issues/` moves: status reflected in BOTH the folder and the `> **Status:**` line.
- A short report per action: what was created/moved/closed, the path, and any near-collisions surfaced.

## Note on layout

This skill targets the canonical inbox at repo-root `notes/` (what `notes/README.md`, `dev-issues`, `dev-loop`, `AGENTS.md`, and `docs/developing-ralphy.md` reference). There is no roadmap board; if the inbox is ever relocated, update the paths in this skill's Workflow + Cookbook in the same change.
