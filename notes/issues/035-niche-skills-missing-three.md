# Missing niche skills: FB-creatives, carousel, analog-horror-PSA

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** playbook

## Context

Three recurring project shapes have no niche skill. Agents reinvent the structural rules (set scaffolding, cover-first checkpoint, dual-ref cohesion, mascot-fit, PSA voice + VHS overlay + SMPTE climax) per project.

## What

- **`fb-creatives`** — sotaocr-fb-001 improvised 32-creative scaffold + ad-set grouping (5-set matrix: A real-people / B graphic / C proof / D meme / E niche).
- **`carousel`** — ralphy-carousel-001 improvised cover-first checkpoint, dual-ref cohesion, mascot-fit rule from scratch using two external user-supplied files. Workflow-fixes #1.
- **`analog-horror-psa`** — analog-horror-fridge-001 hand-built the 10-scene × 3s stenciled-pictogram PSA format (IF/DO-NOT/BUT/AND structure, robo-PSA voice, VHS overlay, SMPTE climax). $4.45 spent with no reusable artifact.

## Why it matters

Each missing skill means the next project of that shape starts at zero. The structural rules are non-obvious enough that fresh agents won't infer them.

## Suggested fix

- Create `.agents/skills/fb-creatives/SKILL.md` (5-set scaffold A real-people / B graphic / C proof / D meme / E niche; per-set prompt cookbook).
- Create `.agents/skills/carousel/SKILL.md` (cover-first checkpoint, dual-ref cohesion, mascot-fit rule).
- Create `.agents/skills/analog-horror-psa/SKILL.md` + scaffold `templates/entertainment-viral/analog-horror-psa/` from fridge postmortem via `/templater`. Lift `MobiusWobble + VcrTrackingCanvas + SnowCanvas + GlitchX` to `src/lib/components/overlays/AnalogTV.tsx`.
- Add routing rows in AGENTS.md.

## Sources

- `workspace/projects/sotaocr-fb-001/postmortem/03-cli-issues.md` — #6
- `workspace/projects/sotaocr-fb-001/postmortem/05-workflow-fixes.md` — #3
- `workspace/projects/ralphy-carousel-001/postmortem/05-workflow-fixes.md` — #1
- `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md`
