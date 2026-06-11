# Memory core: tiered markdown store + `ralphy memory` verbs

> **Status:** todo
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

Promoted from idea 013 (ralphy memory system). Decisions made with the user
2026-06-11: storage = plain markdown (one entry per `.md` + a `MEMORY.md`
index per tier, search via scan — no SQLite in this iteration); ingestion =
user-approved promotion (staging dir + explicit approve); reference
architecture noted: nousresearch/hermes-agent.

## What

A memory subsystem under the #108 layout, two tiers:

- **Global** — `.ralphy/memory/` (cross-workspace: model quirks, prompt craft,
  tooling lessons).
- **Workspace** — `.ralphy/workspaces/<ws>/memory/` (client/universe facts:
  cast, style DNA, audience, rejections).

Each tier: flat `<slug>.md` entries + `MEMORY.md` index (one line per entry)
+ `proposed/` staging for unapproved candidates. Entry shape: frontmatter
(`name`, `description`, `type: model|craft|tooling|client|style|user`,
`filed`, `source`) + body with the rule, **Why:**, **How to apply:**, and a
mandatory **Does NOT apply to:** negative-scope line (the #045 lesson).

Verbs (kebab nouns follow existing CLI conventions, JSON default, `-p` pretty):

- `ralphy memory note "<text>" [--workspace [<ws>]] [--type <t>] [--slug <s>]` — direct write (explicit remark = consent)
- `ralphy memory list [--global|--workspace [<ws>]|--all] [--proposed]`
- `ralphy memory show <slug>`
- `ralphy memory search <query>` — substring/word scan across both tiers
- `ralphy memory propose` — write a candidate into `proposed/` (used by the postmortem hook, #113)
- `ralphy memory approve <slug>|--all` / `ralphy memory reject <slug>` — move proposed → active / `rejected/` (move, never delete)
- `ralphy memory recall [--workspace <ws>]` — merged global + active-workspace digest for intake context

## Scope / acceptance

1. `cli/lib/memory/` store module (reuse `cli/lib/paths.ts` root resolution);
   `cli/commands/memory.ts` registered in `cli/index.ts`.
2. Append-only: existing slug on `note` → auto-version `.v2` (mirror the
   artifacts invariant), `reject` moves to `rejected/`, never unlinks.
3. New error codes (e.g. `E_MEMORY_NOT_FOUND`) appended to
   `cli/lib/errors/catalog.ts` — respect the `< 40` cap + append-only test.
4. Unit tests (`tests/unit/memory-*.test.ts`) covering tiers, versioning,
   approve/reject, recall merge order (workspace overrides global on slug
   collision).
5. Regen `cli:surface:build` + `docs:cli`; lints green; English-only.

## Design refinements (from the hermes-agent study, 2026-06-11)

Patterns lifted from `nousresearch/hermes-agent` (its builtin store is
`tools/memory_tool.py`; orchestration `agent/memory_manager.py`):

- **Bounded store, consolidate-on-overflow.** Hermes caps MEMORY.md at ~2200
  chars total — the cap is the curation forcing-function. Adopt a softer
  variant: cap ACTIVE entries per tier (default 100); when `note`/`approve`
  would exceed it, refuse with the current index + "consolidate first"
  guidance (merge overlapping entries / reject stale ones). No silent drops.
- **Atomic writes.** All file writes go temp-file + rename (Bun `write` then
  `fs.renameSync`) so a concurrent reader never sees a half-written entry or
  index. MEMORY.md index is regenerated, so atomicity matters most there.
- **Don't store task progress.** The store module's verb help and the entry
  schema docs must say: memory is durable rules and facts — task progress,
  session outcomes, and per-project work logs live in project `logs/` +
  `postmortem/`, not in memory entries.
- **Recall is fenced reference data.** `recall` JSON output carries a
  `note: "recalled background reference — verify entries still apply before
  acting on them"` field; the agent-side discipline (#114) repeats it.
- **Drift tolerance.** Memory files are user-editable markdown by design
  (unlike hermes' parser-owned format) — the store must tolerate hand-edited
  bodies; only frontmatter keys it owns are validated, unknown keys pass
  through untouched.

## Notes

- Foundational — #113 and #114 sequence after this.
- Seeding global memory from the maintainer's private Claude memory is a
  local data step after this lands (relates to #060, which stays open for the
  public-repo port).
- Future (separate issues, do NOT build now): FTS index over tiers; a
  curator-style maintenance verb (consolidate/archive stale entries —
  hermes archives, never deletes); a mid-session nudge cadence.
