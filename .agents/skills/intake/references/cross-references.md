# Intake cross-references

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Cross-references

- [`agent-production-contract.md`](../../../../docs/playbooks/agent-production-contract.md) — the canonical phase sequence this playbook executes phases 1-7 of; the source of truth for order, artifacts, and bypass logging.
- AGENTS.md routing — intake.md is the first row in the table for "new project" intent.
- `.agents/skills/scenarist/SKILL.md` — picks up after intake; receives the user-confirmed plan.
- `.agents/skills/art-director/SKILL.md` — receives the locked scenario + per-scene generation cadence.
- `.agents/skills/producer/SKILL.md` — orchestrates the end-to-end chain; references intake.md for the gate at every role-transition.
- `docs/skills-vs-templates.md` — the skills-vs-remix-templates model behind step 1.4.
- `.agents/skills/ugc-*` (and `/poster`, `/carousel`, …) — the content-niche craft-overlay skills loaded on top of a template match in the cold-start step.
- `ralphy template suggest --help` / the public Library (https://www.alecs5am.com/library) — the media-format map (primary template axis matched on cold start) + the template roster (general + style; style templates double as remix targets on an explicit pointer). The repo `templates/` folder was retired (#084).
- The tried-and-dropped table in [`docs/models/dropped.md`](../../../../docs/models/dropped.md) (also printed per model by `ralphy models show <id>`) — what to avoid when picking the stack in step 2.
- All 10 project postmortems under `.ralphy/workspaces/<ws>/projects/<id>/postmortem/` or root `POSTMORTEM.md` — they exist BECAUSE skipping one of these gates cost real money. Re-read the closest sibling postmortem if you're about to skip a step.
