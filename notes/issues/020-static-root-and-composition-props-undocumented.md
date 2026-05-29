# Remotion `STATIC_ROOT` + `composition-props.json` conventions undocumented

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** docs

## Context

The Remotion render path used by `ralphy render` depends on (1) a `STATIC_ROOT` / `public-symlink` convention that names how project assets surface to the Remotion bundle, and (2) `composition-props.json` for prop forwarding. Both are required, both are undocumented in the editor playbook, and existing example projects under `src/videos/` use contradictory patterns.

## What

- `tokyo-y2k-001`: copied `STATIC_ROOT = "<id>"` from `playdate-pixel-001/index.tsx`; first render 404'd every clip because the new symlink convention is `project-<id>` and asset paths should NOT prefix with `assets/`.
- `analog-horror-fridge-001`, `glitter-cream-001`: hit `composition-props.json` required-but-undocumented error on first render — even for prop-less compositions.
- `tokyo-y2k-001` had to stub `{ "compositionId": "<name>" }` by hand.

## Why it matters

First-render failures across multiple projects, each costing ~30 min of trial-and-error. New compositions break on first render and the agent has no playbook to read.

## Suggested fix

- Add "STATIC_ROOT recipe" section to `docs/playbooks/editor/render-pipeline.md` with verbatim correct code.
- Migrate legacy `src/videos/*/index.tsx` to the new convention so examples don't mislead.
- `ralphy render`: auto-generate `composition-props.json` from `src/Root.tsx` registration on first run, or skip the read when `--composition <id>` is passed directly.
- New helper: `ralphy project show <id> --remotion-paths` prints the exact STATIC_ROOT + symlink string for the project.

## Sources

- `workspace/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` — #2
- `workspace/projects/tokyo-y2k-001/postmortem/05-workflow-fixes.md` — #1
- `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md` — composition-props undocumented
- `workspace/projects/glitter-cream-001/POSTMORTEM.md` — same
