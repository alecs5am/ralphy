# `ralphy new` and `ralphy project create` write to divergent registries

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`ralphy new` writes to `~/.ralphy/projects/`. `ralphy project create` writes to `workspace/projects/`. `ralphy generate` and `ralphy render` only see the second. Orphan projects from `ralphy new` are invisible to the rest of the CLI. This is documented in MEMORY (`project_ralphy_new_vs_create_bug`) but never fixed.

## What

- `choose-your-guide-001`: GAP-9 (HIGH) — confused the agent for 10 min with `E_NOT_FOUND: Project not found` after `ralphy new`.
- `kbo-broadcast-001`: #4 — `--name` repeatedly forgotten even with `--id`.
- `free-air-vpn-stickerpack`: #5 — `log-asset` flag ergonomics; positional `<id>` vs sibling verbs taking `--project`.
- `openrouter-ship-001`: `project create --name` should default.

## Why it matters

First-touch UX failure. The agent's mental model is "two registries, one for each verb" which is wrong and load-bearing.

## Suggested fix

- Unify both registries onto `workspace/projects/`, OR deprecate `ralphy new` with a redirect message.
- Make `--name` default to title-cased `--id` so it's not required.
- Accept `--project <id>` as an alias on every project-scoped verb (currently inconsistent — `log-asset` takes positional `<id>`, others take `--project`).
- Update intake playbook (step 0 / first call) to match.

## Sources

- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-9
- `workspace/projects/kbo-broadcast-001/postmortem/03-cli-issues.md` — #4 bug bucket
- `workspace/projects/free-air-vpn-stickerpack/postmortem/03-cli-issues.md` — #5
- `workspace/projects/openrouter-ship-001/postmortem/03-cli-issues.md` — `create --name` default
- MEMORY: `project_ralphy_new_vs_create_bug`
