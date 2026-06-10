# Sweep CLI surface + agent system prompts / docs to the new workspaces + `artifacts/` layout

> **Status:** todo
> **Filed:** 2026-06-10
> **Folder:** issues

## Context

Requested by the user 2026-06-10 alongside the layout redesign: once #105 (`artifacts/`), #108 (workspaces + `.ralphy/` root), and #106 (migration) land, the **agent-facing surface** — every doc, playbook, skill, and CLI help string that names the old paths or assumes a flat `workspace/projects/` model — is stale and will mis-route the agent. The redesign issues each carry a local docs bullet, but the prompt/doc surface is large and cross-cutting enough that it needs one dedicated, exhaustive sweep so nothing references `workspace/projects/<id>/assets/` or `refs/` after the cutover.

## What

A single pass that updates the entire on-disk instruction + CLI-surface layer to the final layout:

- **System prompt / routing**: `AGENTS.md` (the `workspace/projects/<id>/` references throughout the routing table and Project-memory section; the path enumerations in invariants **#14** and **#17**; add workspace-awareness to the discipline section), `CLAUDE.md` (the "Project layout" section — `assets/` "raw working dump" bullet, `refs/`, the whole tree), `MEMORY.md` is auto so leave it.
- **CLI docs**: `CLI.md`, `docs/agent-guide.md`, `docs/cli-spec.md` — document the new `ralphy workspace {create|list|show|use}` + `ralphy project move` verbs, the `--workspace` flag, the `shared/` resolution order, and the migration verb (#106); rewrite every `assets/`/`refs/`/`workspace/projects/` path reference.
- **Playbooks**: `docs/playbooks/*.md` (core, art-director, editor, producer, hyperframes, intake, …) — any path reference to `assets/<kind>/`, `refs/`, `workspace/projects/<id>/`.
- **Skills (re-check EVERY one, not just the obvious path-referencing ones)**: walk all of `.agents/skills/*/SKILL.md` (+ any `references/` sub-docs) — the content-niche craft overlays (poster, fb-creatives, carousel, audio-explainer, analog-horror-psa, ugc-*, json-prompt-engine), the operational skills (researcher, evaluator, templater, postmortem, install), the maintainer skills (dev-release, dev-tasks, dev-issues, dev-loop, dev-publish-template), and the HyperFrames render-engine skills. Any reference to `assets/<kind>/`, `refs/`, `workspace/projects/<id>/`, or an assumed flat-project model gets rewritten; skills that *write* to project dirs (templater, unit-forming flows) must use the new `artifacts/` + workspace paths. `.claude/skills/` is a symlink to `.agents/skills/` — fixing the source fixes both. Also sweep `notes/skills/*/SKILL.md` if any name project paths.
- **CLI help strings**: command descriptions / examples in `cli/commands/*.ts` that print old paths; the no-subcommand profile output if it references layout.
- **Tests**: `tests/unit/agents-md-invariants.test.ts` likely asserts on path strings / invariant wording — update to match, do not weaken the invariant intent.

## Why it matters

The agent routes off `AGENTS.md` + playbooks on every request. If they still say "generated output lands in `workspace/projects/<id>/assets/`" after the migration, the agent will look in the wrong place, mis-instruct `ralphy`, or hand-write dead paths — the exact "skipped the playbook → wrong path" defect class the whole structure exists to prevent. A stale prompt surface silently undoes the value of the restructure.

## Scope / acceptance

- `rg -n 'workspace/projects/|/assets/|/refs/' AGENTS.md CLAUDE.md CLI.md docs/ .agents/ notes/skills/` returns only intentional/historical references (e.g. postmortem citations) — no live instruction still tells the agent to use the old layout.
- Every `.agents/skills/*/SKILL.md` has been individually opened and confirmed clean (path references + any project-write logic updated) — tracked as a checklist in the PR/commit so no skill is silently skipped.
- New verbs (`ralphy workspace …`, `ralphy project move`, the migration verb) are documented in `CLI.md` + `docs/cli-spec.md` with examples.
- The `shared/` resolution order and the `--ref shared/...` form are documented where refs are explained (art-director playbook + `docs/agent-guide.md`).
- `AGENTS.md` invariants #14 and #17 enumerate the new paths (`.ralphy/workspaces/<ws>/projects/<id>/artifacts/...`).
- `bun test` green (incl. updated `agents-md-invariants.test.ts`); `rg '\p{Cyrillic}' --pcre2` clean on touched files (English-only-on-disk).

## Notes

- **Sequence after #105 + #108 + #106** — the docs describe the *final* state; writing them before the code/migration lands risks documenting a layout that shifts. A small subset (the new verb docs) can be drafted alongside #108, but the path-reference sweep should run after the cutover.
- This expands and centralizes the per-issue docs bullets in #105/#106/#108 — treat those as the local minimum and this as the exhaustive cross-cutting pass.
- Watch for path references baked into example projects / `STORYBOARD.md` templates and the `ralphy-assets` companion-repo docs (`docs/assets-catalog.md`).
- Cross-links: **#105**, **#106**, **#108** (the changes this documents), **#107** (studio app README also describes the layout it browses).
