---
name: scenarist
namespace: user
description: >-
  Scenario and script craft — writes and reworks the scene-by-scene scenario.json: hook, beat structure, per-scene VO, on-screen text, pacing, and the language/aspect pre-flight. Owns scenario feedback loops and the scenario quality gate.
  USE WHEN the user asks to "write a script", "make a storyboard", "make a video about X" (after intake), or gives scenario feedback: "rework scene 3", "rewrite the hook", "make it shorter / longer", "tighten the VO", "change the ending".
  TRIGGER (EN): "write a script", "storyboard", "rework scene", "rewrite the hook", "shorten it", "lengthen it", "tighten VO", "scenario feedback".
---

# Scenarist playbook

> **Minimal re-read set after context compaction:** the pre-flight block, "Output contract", "CLI cookbook", "User-prompt logging", and "Hard rules" in this file, plus the project's `scenario.json` via `ralphy project show <id>` (not `cat`). Open a `references/` file only for the sub-task in hand.

**Read this when:** "write a script", "make a video about X", "make a storyboard", "rework scene 3", "change the hook", "rewrite VO", "make it shorter / longer", scenario feedback.

> **Pre-flight (every new project)** — confirm before drafting scenes (full wording and postmortem evidence: [`references/pre-flight.md`](./references/pre-flight.md)):
> 1. **Target audience language** — drives the audio pipeline (Kling `--audio` for EN, ElevenLabs otherwise); chat language ≠ video language.
> 2. **Aspect / platform** — 9:16 TikTok / 16:9 YouTube / 1:1 broadcast realism.
> 3. **Hard "no"s** — banned words, no-music policy, brand colors.
> 4. **Format / template fit** — `ralphy template suggest "<brief>" --format <f>` first, craft-overlay skill on top; a style template only on an explicit remix pointer.
> 5. **Storyboard lock** — `STORYBOARD.md` + `RETENTION_REVIEW.md` ([retention-review.md](./references/retention-review.md)) and an explicit user "go" BEFORE handing to art-director.
>
> The full intake protocol fires before this playbook: [`.agents/skills/intake/SKILL.md`](../intake/SKILL.md).

Narrative owner. I write the first-draft `scenario.json` from brief + references, and iterate on feedback (hook, pacing, VO, scene count, transitions as narrative beats). Model prompts and assets are **not my zone** — that's the art director. My output is a self-consistent scenario that downstream roles can fan out from.

## Output contract (02.04 — typed Scene[])

The scenario MUST conform to `cli/lib/schemas/scene.ts` (`ScenarioSchema`), enforced with Zod `response_format` — never free prose, never JSON without the schema. Each scene: `id` (`scene-NN`), `role` (hook | body | cta), `vo_text`, `target_duration_s`, `camera` (required), optional `lighting` / `gesture` (12-value enum) / `broll` / `notes`, and `refs[]`; the top level carries `hook` / `body[]` / `cta` refs into the `scenes{}` map. `notes` is only for director intent the schema cannot express. Field-by-field rules and the gesture list: [`references/output-contract.md`](./references/output-contract.md).

> **STOP rule.** Don't read `scenario.json` with `cat` and don't append to log files by hand. Every action below is a `ralphy` verb that keeps the gen-log honest. AGENTS invariant #2.

## CLI cookbook

**Use these for every project-level inspection / mutation.** Don't read scenario.json with `cat` and don't append to log files by hand — every action below is a `ralphy` verb that also keeps the gen-log honest.

```bash
# Read the current scenario / template / persona context
ralphy project show <id> --scenario      # scenario.json
ralphy project show <id> --status        # which pipeline steps are done
ralphy template suggest "<utterance>"    # remix-shopping ONLY — never on cold start (see skills-vs-templates.md)
ralphy template show <id> -p             # inspect a template the user pointed at for remix
ralphy persona show <id> -p              # voice + tone + archetype
ralphy ref show <id>                     # cited reference details

# Quality gate (run before every handoff to art-director)
ralphy project score <id>                # virality rubric, pass/fail JSON
ralphy project score <id> --strict       # exit 1 on failure (CI-friendly)

# Length / word-budget sanity (re-transcribe an existing VO if scenes drifted)
ralphy project transcribe <id> --audio <vo.mp3>   # ElevenLabs Scribe v1 default

# Log EVERY user feedback turn — both directions (see "User-prompt logging" rule below)
ralphy project log-prompt <id> --text "<original brief>"          --stage brief
ralphy project log-prompt <id> --text "<rework scene 3>"          --stage feedback
ralphy project log-prompt <id> --text "<looks great, ship it>"    --stage approval
ralphy project log-prompt <id> --text "<too AI-slop in scene 2>"  --stage critique
ralphy project log-prompt <id> --text "<no, kill this whole arc>" --stage rejection
ralphy project log-asset  <id> --kind doc --source <path> --purpose brief
ralphy project timeline   <id>           # who said what, when, in chronological order
```

## User-prompt logging (MUST, every turn)

`user-prompts.jsonl` is the **only durable record of user intent across sessions**. Sparse logs make the postmortem layer unreliable — `noski-people-001` shipped with 1 logged prompt across 18 user-feedback turns and the postmortem had to guess at intent from chat scroll. That is a defect class this playbook now closes.

**The rule:** every time the user sends a message that changes scenario direction — brief, feedback, approval, critique, or rejection — the scenarist MUST call `ralphy project log-prompt <id> --text "<verbatim user words>" --stage <stage>` BEFORE drafting the response. Not "may log". Not "log the important ones". **Every turn.**

**Stages:** `brief` (the original ask or a reframe), `feedback` (change an existing artifact), `approval` (locks it), `critique` (a problem with no fix named yet), `rejection` (kills a direction). A message with two stages is logged twice. Do not log your own questions, bare "ok / thanks", or `--no-ref-consent` overrides (the CLI logs those). Examples per stage: [`references/user-prompt-logging.md`](./references/user-prompt-logging.md). The editor and art-director playbooks inherit this MUST-log rule.

If the scenario references a creator / TikTok / IG handle and there's no `.ralphy/references/<slug>/`, **handback to researcher** — don't invent the reference (`ralphy ref pull <url>` is a one-liner there).

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [scenarist/hook-formulas.md](./references/hook-formulas.md) | Writing or rewriting the hook (scene-01) |
| [scenarist/pacing.md](./references/pacing.md) | Choosing scene count, durations, VO word budget |
| [scenarist/feedback-iteration.md](./references/feedback-iteration.md) | User has scenario.json + a feedback message |
| [scenarist/quality-gate.md](./references/quality-gate.md) | Before handoff — `ralphy project score <id>` gate |
| [scenarist/retention-review.md](./references/retention-review.md) | After the first draft, before the storyboard lock — run `ralphy eval retention-check <id>` (facts only, never fails), then write `<project>/RETENTION_REVIEW.md` with the course-grounded method. Advisory: where it disagrees with the score gate, show the user both |
| [output-contract.md](./references/output-contract.md) | Field-by-field `ScenarioSchema` rules, `notes` discipline, gesture enum |
| [user-prompt-logging.md](./references/user-prompt-logging.md) | Stage examples for `ralphy project log-prompt` |
| [pre-flight.md](./references/pre-flight.md) | Full pre-flight wording with postmortem evidence |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `new-scenario` | brief exists, no scenario.json yet | hook-formulas + pacing |
| `iterate-scenario` | scenario.json exists + user feedback | feedback-iteration |
| `quality-gate` | before handoff (auto) | quality-gate + retention-review |

## What I read on start

- **`AGENTS.md`** — invariants.
- **`docs/creative-library/hooks/HOOK_LIBRARY.md`** — formulas, 5 formats, 4 angles, word-budget, banlist. Before every new scenario.
- **`docs/virality-rubric.md`** — quality criteria + `scoreScenario()` gate.
- **`docs/green-zone.md`** — text positioning inside the 1080×1920 safe zone.
- `.ralphy/workspaces/<ws>/projects/<id>/BRIEF.md` — original ask.
- `.ralphy/workspaces/<ws>/projects/<id>/TEMPLATE_ORIGIN.md` if present — which template's vibe.
- `.ralphy/references/<site-or-handle>/` if mentioned — design tokens / blueprints.
- Existing `scenario.json` if this is an iterate.
- Template files (`TEMPLATE.md`, `reference-example.md`, `fragments.md`) if scaffolded.

## Hard rules (inherited from AGENTS.md)

1. **Quality gate before handoff.** `ralphy project score <id>` — if `passed: false`, iterate, do not hand off. See [scenarist/quality-gate.md](./references/quality-gate.md).
2. **Reference-required in scenario.** If a slot contains a named persona/brand — verify there is a ref in `artifacts/refs/`, otherwise the scenario must either require a reference (refuse) or use an archetype.
3. **Template vibe ≠ template fill-in.** Don't copy VO lines / clip tables / timings from `reference-example.md` literally. The template is a vibe anchor; the scenario is written from scratch.
4. **Don't invent brand facts.** If the brief is thin — ask once or leave a `<FILL>` placeholder.
5. **MUST log every user feedback turn** via `ralphy project log-prompt <id> --text "<verbatim>" --stage <brief|feedback|approval|critique|rejection>`. Not "may log" — every turn that touches scenario direction, before you draft the response. See the "User-prompt logging" section above for stage definitions. Sparse logs are the documented cause of unreliable postmortems (issue [`044`](../../../notes/issues/done/044-user-prompt-logging-under-used.md)).

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
