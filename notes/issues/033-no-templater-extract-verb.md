# `/ralphy-templater` skill has no backing CLI verb

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

The `/ralphy-templater` skill is the documented path for promoting a finished project into `templates/<category>/<slug>/`. There is no CLI verb. Extraction is hand-done or skipped entirely. Even successful projects with rich postmortems never become reusable templates.

## What

- `openrouter-ship-001`: "Missing verb: `ralphy templater extract <project-id>`" — promised to user twice, left as TODO.
- `choose-your-guide-001`: GAP-4 + workflow-fixes #7 — `templates/entertainment-viral/choose-your-guide/` never extracted despite 17 successful iterations.

## Why it matters

The whole point of the template system is that costly experiments compound. When extraction is manual and recurring, it doesn't happen — every project starts at zero.

## Suggested fix

- New `cli/commands/template.ts → extract <project-id> --category <c> --slug <s>`:
  - Reads `data-composition-variables` from `index.html`.
  - Copies `index.html` + composition assets into `templates/<category>/<slug>/`.
  - Generates `template.json` (manifest), sample remix script, and a README skeleton.
  - Lifts heavy reference assets (>1MB or marked-reusable) to `ralphy-assets/pool/`.
  - Records the extraction in `generations.jsonl` so postmortems see it.
- Reuse `.agents/skills/ralphy-templater/SKILL.md` as the human-readable how-to; the CLI verb handles mechanics.

## Sources

- `workspace/projects/openrouter-ship-001/postmortem/03-cli-issues.md`
- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-4
- `workspace/projects/choose-your-guide-001/postmortem/05-workflow-fixes.md` — #7
