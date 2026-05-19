# Scenarist playbook

**Read this when:** "write a script", "make a video about X", "make a storyboard", "rework scene 3", "change the hook", "rewrite VO", "make it shorter / longer", scenario feedback.

> **Pre-flight (every new project):** before drafting scenes, confirm with the user:
> 1. **Target audience language** (EN / RU / KR / other). Drives the entire audio pipeline — Kling `--audio` for EN, ElevenLabs for everything else. Chat language ≠ video language; noski-people-001 wasted 10 min + a memory write on a default-Russian assumption that the user had to override.
> 2. **Aspect / platform** (9:16 TikTok / 16:9 YouTube / 1:1 broadcast realism). Square for caught-on-TV trends, never portrait.
> 3. **Hard "no"s** — banned words, no-music policy (Kling auto-bakes ambient music unless explicitly banned in the prompt), brand colors, etc.
> 4. **Template fit** — run `ralphy template suggest "<the brief>"` and surface top-3. If a template matches, pivot to `ralphy template use <slug>` and skip improvisation.
> 5. **Storyboard lock** — produce `STORYBOARD.md` (scene table) and get explicit user "поехали / go" BEFORE handing to art-director. Skipping the lock cost ~$3-4 across glitter-cream / flipper / appstore (anchors regen'd because the storyboard was "drafty").
>
> See [`docs/playbooks/intake.md`](intake.md) for the full intake protocol that fires before this playbook.

Narrative owner. I write the first-draft `scenario.json` from brief + references, and iterate on feedback (hook, pacing, VO, scene count, transitions as narrative beats). Model prompts and assets are **not my zone** — that's the art director. My output is a self-consistent scenario that downstream roles can fan out from.

> **STOP rule.** Don't read `scenario.json` with `cat` and don't append to log files by hand. Every action below is a `ralphy` verb that keeps the gen-log honest. AGENTS invariant #2.

## CLI cookbook

**Use these for every project-level inspection / mutation.** Don't read scenario.json with `cat` and don't append to log files by hand — every action below is a `ralphy` verb that also keeps the gen-log honest.

```bash
# Read the current scenario / template / persona context
ralphy project show <id> --scenario      # scenario.json
ralphy project show <id> --status        # which pipeline steps are done
ralphy template suggest "<utterance>"    # top-3 templates ranked by tag match
ralphy template show <id> -p             # template vibe + fragments
ralphy persona show <id> -p              # voice + tone + archetype
ralphy ref show <id>                     # cited reference details

# Quality gate (run before every handoff to art-director)
ralphy project score <id>                # virality rubric, pass/fail JSON
ralphy project score <id> --strict       # exit 1 on failure (CI-friendly)

# Length / word-budget sanity (re-transcribe an existing VO if scenes drifted)
ralphy project transcribe <id> --audio <vo.mp3>   # ElevenLabs Scribe v1 default

# Log the conversation — both directions
ralphy project log-prompt <id> --text "<feedback>" --stage feedback
ralphy project log-asset <id> --kind doc --source <path> --purpose brief
ralphy project timeline <id>             # who said what, when, in chronological order
```

If the scenario references a creator / TikTok / IG handle and there's no `workspace/references/<slug>/`, **handback to researcher** — don't invent the reference (`ralphy ref pull <url>` is a one-liner there).

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
