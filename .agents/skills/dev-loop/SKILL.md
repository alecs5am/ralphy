---
name: dev-loop
namespace: maintainer
description: >-
  Run an autonomous, issue-driven development loop over Ralphy itself — the same cadence as a focused maintainer session: pick the open `notes/issues/`, order them by dependency, then for each issue dispatch a scoped sub-agent, review its diff, run the real gates, and commit + push to main before moving to the next. Sequential by default (one agent at a time) so changes never collide on shared files. Default scope is ALL open issues with a safety limit of 25; the user can widen the scope or raise the limit in their prompt. Pauses for the user only at genuine decision forks and before any paid generation or irreversible/outward-facing action.
  USE WHEN the user types `/dev-loop`, says "work through the issues", "run the dev loop", "grind the backlog", "implement all the open issues", "keep going through notes/issues until done", or after `/dev-issues` has filed a batch they now want executed.
  DO NOT FIRE for a single issue (just implement it), for content/video production, or when there are no open issues to execute.
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# dev-loop — autonomous issue-driven dev cycle

A **maintainer** skill. It executes the open work in `notes/issues/` (the inbox `/dev-issues` fills), one issue at a time, committing after each. It does not touch `.ralphy/workspaces/<ws>/projects/` or call media models except where an issue explicitly requires it (and then only behind the paid-generation gate below).

## Scope + limit

- **Default scope:** every open issue at the **flat top level** of `notes/issues/`. The `notes/issues/done/` and `notes/issues/deprecated/` subfolders are the closed archive — **never in scope** (status is encoded by folder; see [Issues folder layout](../../../notes/README.md#issues-folder-layout)).
- **Default limit:** **25 issues** per loop run. If the user's prompt names more (or "no limit", or a specific subset / range), honor that.
- The user can narrow scope in their prompt ("just the landing ones", "only #052-#055", "everything tagged cli").

## Workflow (per run)

1. **Read the rules first.** `docs/developing-ralphy.md` (English-only, the lint suite, append-only contract, auto-generated files), `AGENTS.md` (the hard invariants — especially "wait for user 'go' before any paid generation"), and `notes/README.md` (including the [Issues folder layout](../../../notes/README.md#issues-folder-layout) — active work is the flat top level only). Skim every candidate issue.

2. **Build the execution order.** Sort issues by dependency, not by number:
   - Foundational / schema / data-model changes FIRST (everything keys off them).
   - Cross-cutting renames or moves NEXT, as a single coordinated step (never parallelize these).
   - Independent, low-collision, and plan-only/docs issues can go any time.
   - Read each issue's `## Notes` for explicit "sequence after #NNN" hints.
   State the planned order up front and track it with `TaskCreate` / `TaskUpdate` (one task per issue; mark in_progress on start, completed on land).

3. **For each issue, in order:**
   a. **Dispatch ONE sub-agent** (the `Agent` tool, usually `general-purpose`) with a tight, self-contained mandate: the mandatory reads, the exact scope, the gates it must pass, "do NOT git commit or push — leave changes in the working tree", and a required structured report-back. Give it the rename maps / file lists / schema decisions up front so it does not improvise on settled questions. Run agents **sequentially** — wait for one to finish and land before starting the next — to avoid collisions on shared files (`AGENTS.md`, skills, the landing app, the template schema).
   b. **Review the diff yourself.** Read the changed files / diffstat. Trust but verify the agent's report — re-run the real gates manually: the relevant `lint:*` scripts, the affected `bun test` files, `cli:surface:build` for CLI-surface changes, and `rg '\p{Cyrillic}' --pcre2` over changed files (text only; `.webp`/`.png` are binary false positives). Web and public-doc checks run in their sibling repositories.
   c. **Close gaps.** Fix small issues inline; for a substantive miss, dispatch a focused follow-up agent (you cannot resume a finished agent — `SendMessage` is not available — so either edit directly or spawn a fresh scoped agent).
   d. **Commit + push to main, then move on.** One commit per issue with a Conventional-Commits message referencing the issue number. As part of that same commit, **`git mv` the issue into `notes/issues/done/` and update its `> **Status:**` line to `done — <YYYY-MM-DD>`** (the folder is the live signal, the line carries the date/why — keep them in sync). If the issue turns out to be obsolete or superseded rather than implemented, `git mv` it into `notes/issues/deprecated/` and set the line to `SUPERSEDED by #NNN` / `dropped (<reason>)` instead. Never delete the note — moving preserves the record. Push to `origin` (this repo commits to main; never `gitlab`).

4. **Repeat** until the scope is exhausted or the limit is hit. Report a final summary: issues landed (with commit SHAs), issues skipped/deferred and why, and any new issues discovered mid-run (file them via the `/dev-issues` shape).

## Gates the loop must respect

- **Paid-generation gate.** If an issue requires paid model generation (image/video/voice/icon gen via `ralphy generate` or OpenRouter/ElevenLabs), STOP and ask the user for explicit go-ahead with a cost estimate before spending. This is an AGENTS.md hard invariant.
- **Irreversible / outward-facing gate.** Pause and confirm before repo-split-class operations, force-pushes, deletions of user artifacts, publishing releases, or anything that leaves the repo.
- **Decision forks.** Where an issue leaves a genuine choice that is the user's (scope, naming convention, product direction), use `AskUserQuestion` rather than guessing.

## The flaky pre-commit/pre-push hook

The husky hooks run the full `bun test` suite, which contains a load-dependent flaky integration timeout (`tests/integration/cli-dryrun*.test.ts`; see issue #061) that passes in isolation but intermittently fails under full-suite parallel load. When it blocks a commit/push but every REAL gate you ran manually is green, `--no-verify` is acceptable — but only after you have manually verified the lints + relevant tests + `cli:surface:check` yourself. Never `--no-verify` to skip a gate that legitimately fails.

## HARD INVARIANTS

- **Sequential, not parallel.** One issue, one agent, one commit at a time. Parallel agents collide on shared files.
- **Commit + push after each issue** before starting the next — keeps the working tree clean and each change reviewable in isolation.
- **Never rewrite a published commit.** If you need to add to something already pushed, append a NEW commit; never force-push main.
- **Review every agent diff.** The agent's report is a claim; the gates are the proof. Re-run them.
- **English-only on disk.** Run the Cyrillic gate before every commit.
- **Respect the paid-generation and irreversible-action gates above** — the loop is autonomous, not unsupervised.
- **Resolve = move, never delete.** A landed issue is `git mv`'d into `notes/issues/done/` (obsolete → `deprecated/`) with its `> **Status:**` line synced — never `rm`'d. The archive is the record of what was already tried. Only the flat top level is ever in scope.
- **Append-only on `.ralphy/workspaces/<ws>/projects/` and the JSONL logs** (AGENTS.md #14).
