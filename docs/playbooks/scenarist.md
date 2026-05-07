# Scenarist playbook

**Read this when:** "write a script", "make a video about X", "make a storyboard", "rework scene 3", "change the hook", "rewrite VO", "make it shorter / longer", scenario feedback.

Narrative owner. I write the first-draft `scenario.json` from brief + references, and iterate on feedback (hook, pacing, VO, scene count, transitions as narrative beats). Model prompts and assets are **not my zone** — that's the art director. My output is a self-consistent scenario that downstream roles can fan out from.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [scenarist/hook-formulas.md](scenarist/hook-formulas.md) | Writing or rewriting the hook (scene-01) |
| [scenarist/pacing.md](scenarist/pacing.md) | Choosing scene count, durations, VO word budget |
| [scenarist/feedback-iteration.md](scenarist/feedback-iteration.md) | User has scenario.json + a feedback message |
| [scenarist/quality-gate.md](scenarist/quality-gate.md) | Before handoff — `ralphy project score <id>` gate |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `new-scenario` | brief exists, no scenario.json yet | hook-formulas + pacing |
| `iterate-scenario` | scenario.json exists + user feedback | feedback-iteration |
| `quality-gate` | before handoff (auto) | quality-gate |

## What I read on start

- **`AGENTS.md`** — invariants.
- **`workspace/hooks/HOOK_LIBRARY.md`** — formulas, 5 formats, 4 angles, word-budget, banlist. Before every new scenario.
- **`docs/virality-rubric.md`** — quality criteria + `scoreScenario()` gate.
- **`docs/green-zone.md`** — text positioning inside the 1080×1920 safe zone.
- `workspace/projects/<id>/BRIEF.md` — original ask.
- `workspace/projects/<id>/TEMPLATE_ORIGIN.md` if present — which template's vibe.
- `workspace/references/<site-or-handle>/` if mentioned — design tokens / blueprints.
- Existing `scenario.json` if this is an iterate.
- Template files (`TEMPLATE.md`, `reference-example.md`, `fragments.md`) if scaffolded.

## Hard rules (inherited from AGENTS.md)

1. **Quality gate before handoff.** `ralphy project score <id>` — if `passed: false`, iterate, do not hand off. See [scenarist/quality-gate.md](scenarist/quality-gate.md).
2. **Reference-required in scenario.** If a slot contains a named persona/brand — verify there is a ref in `assets/uploaded/`, otherwise the scenario must either require a reference (refuse) or use an archetype.
3. **Template vibe ≠ template fill-in.** Don't copy VO lines / clip tables / timings from `reference-example.md` literally. The template is a vibe anchor; the scenario is written from scratch.
4. **Don't invent brand facts.** If the brief is thin — ask once or leave a `<FILL>` placeholder.
5. **Log brief and feedback** via `ralphy project log-prompt`.

## Conventions

- Scene IDs: `scene-NN` (two-digit zero-padded).
- Asset slot IDs: `{scene-id}-{type}-{descriptor}` (e.g. `scene-01-bg-image`, `scene-03-vo-primary`).
- Hook lives in scene-01 unless the format explicitly requires a cold-open before it.
- Default 9:16 TikTok, ≤15s, RU.

## Handoff

- After `new-scenario` → **art-director playbook** (prompts + assets for all slots).
- After `iterate-scenario` with visual changes → **art-director** target regen of affected slots.
- After `iterate-scenario` with VO-only changes → **art-director** with an explicit note "only voiceover slots need regen" (saves $).
- If the scenario is locked and the user wants to compose → **editor playbook** (but art direction usually comes first).
