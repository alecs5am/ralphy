---
name: dev-issues
namespace: maintainer
description: >-
  Turn a free-form brain-dump into a clean, ordered set of `notes/issues/*.md` work items. The user tags `/dev-issues` and writes a long stream of everything in their head — features, refactors, bugs, half-formed ideas, product direction. This skill decomposes that stream into discrete, well-shaped, individually-actionable issue files, asks clarifying questions only where a decision is genuinely the user's, collision-checks against the existing `notes/` inbox so it updates rather than duplicates, then commits the batch. The end state: every thought is captured as an issue a downstream agent (or `/dev-loop`) can pick up and execute.
  USE WHEN the user types `/dev-issues`, says "let me brain-dump", "capture all of this into issues", "break this into issues", "I have a bunch of ideas", "distribute these thoughts", or pastes a long unstructured list of things they want done to Ralphy.
  DO NOT FIRE for a single scoped change (just do it), for content/video work (that is the routing table), or to capture a one-off idea / decision into the `notes/` inbox (that is `dev-tasks`).
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# dev-issues — brain-dump → distributed issues

A **maintainer** skill. It does not touch `.ralphy/workspaces/<ws>/projects/` or call media models. It converts an unstructured stream of thoughts into a set of correctly-shaped `notes/issues/*.md` work items. Pairs with `/dev-loop`, which executes the issues this skill files.

## When it fires

- The user tags `/dev-issues` and then writes a lot — a wall of ideas, gripes, product direction, "and also we should…". The longer and less structured the input, the more this skill earns its keep.
- ALSO FIRE when a normal dev conversation produces ≥3 distinct actionable threads the user wants preserved before they evaporate.
- DO NOT FIRE for one scoped task (do it, or file a single note via `dev-tasks`), for content production, or for one-off idea/decision capture into the `notes/` inbox (`dev-tasks`).

## Workflow

1. **Read the inputs first.** Read `notes/README.md` (the note shape + the [Issues folder layout](../../../notes/README.md#issues-folder-layout)), `docs/developing-ralphy.md` (English-only rule, the lint suite), and skim the **active** backlog (the flat top level of `notes/issues/`) plus `notes/ideas/` so you know what already exists. `notes/issues/done/` and `notes/issues/deprecated/` are the closed archive — skim them only during collision-check (step 3). `dev-tasks` is the sibling skill for `notes/` inbox capture (ideas / decisions).

   > **Status-by-folder.** `notes/issues/` is split into the flat top level (the live backlog), `done/` (resolved / promoted-and-landed), and `deprecated/` (superseded / won't-do). New issues are always filed at the flat top level. Each issue keeps its `> **Status:**` line in sync with its folder.

2. **Decompose the brain-dump into discrete items.** One issue = one coherent unit of work (one verb / file / feature / refactor / bug). Split compound thoughts; merge near-duplicates. Aim for issues a single sub-agent could execute end-to-end.

3. **Collision-check before filing each.** Search **all of `notes/issues/` (active top level + `done/` + `deprecated/`)** and `notes/ideas/` for an existing entity that already covers the thought. If one exists, **update it** (or note the overlap) rather than spawning a duplicate. If the match lives in `done/`, the thought is likely a regression or follow-up — `git mv` it back to the active top level and reset its `> **Status:**` line, or file a fresh issue that cross-links it. Never let the same thing live in two places.

4. **Ask clarifying questions only where the answer changes what gets filed** — a genuine fork the user must decide (scope, irreversibility, a product direction with no sensible default). Use `AskUserQuestion`, batch the questions, and offer a recommended option. Do NOT ask about things you can decide from the repo or sensible defaults. If the user wrote in Russian (or any non-English), that is fine in chat — but everything you WRITE to disk is English (translate/paraphrase).

5. **Write each issue** at the **flat top level** as `notes/issues/NNN-kebab-slug.md`, numbered monotonically across all three locations (`fd -e md . notes/issues | rg -o '[0-9]{3}' | sort -n | tail -1`, increment — never reuse a number freed by a move into `done/`/`deprecated/`). Follow the `notes/README.md` shape (Status / Filed / Folder / Context / What / Why it matters / Notes) **plus** a concrete **`## Scope / acceptance`** section listing what "done" means — file paths, gates to pass, acceptance criteria — so a downstream agent can execute without re-deriving scope. Add severity + category when useful. Cross-link related issues by number.

6. **Order + dependencies.** When the batch has a natural execution order (foundational schema before consumers, a cross-cutting rename before dependent work, plan-only/docs as low-risk), note it — either in a short lead issue or in each issue's Notes ("sequence after #NNN"). `/dev-loop` reads this ordering.

7. **Commit the batch.** `git add notes/issues/<new files>` and commit with a `docs(notes): …` message summarizing the set. Run the Cyrillic gate (`rg '\p{Cyrillic}' --pcre2 notes/issues/<files>`) before committing — empty is the gate. Push only if the user works commit-to-main (this repo does; see the user's memory).

8. **Report back** a thought→issue map: for each filed issue, one line (number, slug, the thought it captures), plus the recommended execution order and any item you deliberately dropped or merged.

## HARD INVARIANTS

- **English-only on disk.** Translate any non-English brain-dump before writing.
- **One thought, one home.** Collision-check first; update over duplicate.
- **Every issue is executable.** If it lacks a concrete `## Scope / acceptance`, it is not ready — sharpen it or ask.
- **Capture, don't execute.** This skill files issues; it does NOT implement them. Hand execution to `/dev-loop` or a targeted dev session.
- **Numbering is monotonic across active + `done/` + `deprecated/`.** Never reuse a number freed by a move, and never renumber existing issues.
- **File active issues at the flat top level only.** `done/` and `deprecated/` are written to by `/dev-loop` (or a manual resolve), never by initial filing.
