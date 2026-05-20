# Intake protocol — clarifying questions + step-by-step gates

> **Adaptive verbosity.** The intake's depth scales with the user's skill score (0-10) and developer badge from `ralphy whoami` (read on session start per AGENTS.md step 0). The same protocol runs at every level, but novice gets explanations after each step, expert gets one-line confirmations. See the band table below.

## Per-band branching (read this BEFORE step 1)

| Band | Score | Behavior |
|---|---|---|
| **novice** | 0-1.9 | Full intake with mini-lectures after each step. Explain "WHY we ask about target language", "WHY location-master-plate first", "WHAT auto-versioning means". Show one tutorial concept per generation step. Slow but builds intuition. |
| **learning** | 2.0-3.9 | Full intake (5 questions). Inline "why" only on the first occurrence of a concept this session. No tutorial concepts; let user ask. |
| **intermediate** | 4.0-5.9 | Full intake (5 questions). No "why" unless user flags confusion. Step-by-step with one-beat-at-a-time gates. |
| **comfortable** | 6.0-7.9 | Full intake but tighter (3-5 questions, skip obvious ones if `preferences.default_*` is set). Batch 4-6 gens after 2 solo approvals. |
| **experienced** | 8.0-9.9 | Compact intake: only critical params (brand / aspect / target_language). Batch by default; user opts into single-step with "по одной". |
| **expert** | 10 | One-line confirmation before paid gens. Assume user knows every rule. Surface CLI output JSON-style without prose explanations. |
| **developer badge** | any | Trumps the band. Minimal intake + raw CLI suggestions + ship-fast default. User can swear at you; you don't sandbag bug reports. |

The user's band comes from `ralphy whoami` (or bare `ralphy`) which returns `user.skill.band` and `user.is_developer`. Branch immediately on `is_developer === true` (skip all bands and use developer behavior); else use the band.

If `whoami` shows `signals.projects_done === 0` AND `tutorial_state.intro_seen === false`, prepend a one-paragraph intro:

> "First project on ralphy! I'm going to walk you through this end-to-end — we'll do 5 quick questions, draft a plan, then make one scene at a time so you can correct course early. After we ship, /postmortem captures lessons so the NEXT project starts at a higher skill level. Cool?"

Then proceed to step 1.

When a user asks for a **new project** (not a casual question, not "tweak this thing"), the agent does NOT jump to generation. It captures intent first, agrees on a plan, then advances one beat at a time with user checkpoints. The cost of asking is one chat turn; the cost of guessing wrong on a 20-scene render is $40 + an hour of regen.

This file is referenced from the AGENTS.md routing table and is the **first** thing every project-creation request hits.

## When this protocol fires

ALWAYS, when the user's request is one of:
- "Сделай видео про X" / "Make a video about X"
- "Я хочу как у вот этого" + URL or screenshot
- "Хочу что-то типа <vague aesthetic>"
- "Запусти проект <name>"
- Any brief with > 1 unknown (target audience? brand? characters? aesthetic? duration?)

NEVER fires when:
- User explicitly says "просто сгенери / just generate", "не спрашивай / don't ask", "погнали".
- User picked a specific template via `ralphy template use <slug>` — the template encodes most decisions; only fill in remaining slots.
- Request is a single asset (`ralphy generate image ...`), an edit ("rework scene 3"), or a debug ask.

## Step 1 — Clarifying questions (intent capture)

Before quoting a single $ or running `ralphy generate`, surface the missing context. Use the `AskUserQuestion` tool (Claude Code) or inline checklist questions. Cover at minimum:

1. **Target audience language.** EN / RU / KR / other? Drives the audio pipeline (Kling `--audio` for EN, ElevenLabs for non-EN). Chat language ≠ video language — this trip-wired noski-people-001 for ~10 min and one wasted memory write.
2. **Aspect / platform.** 9:16 TikTok? 16:9 YouTube? 1:1 broadcast realism? Square is the right call for caught-on-TV trends (kbo postmortem).
3. **Brand / named person / specific entity.** If the brief names a real entity the model cannot fabricate (a specific person, a recognizable brand product, an IP / character), the **reference-required gate** (AGENTS invariant #3) fires — refuse generation until the user supplies a ref or explicitly opts out via `--no-ref-consent "<reason>"` on the failing generate call (logged as `stage: "no-ref-consent"` in `user-prompts.jsonl`). Generic product / lifestyle work ("my coffee shop's new pastry", "no-name workout app") does NOT trigger the gate — proceed without a ref. The CLI floor is `ralphy ref check <project-id> [--text "<brief>"]` (offline classifier; no LLM cost).
4. **Existing template fit.** Before improvising, **always** run `ralphy template suggest "<the user's brief>"` and surface the top-3 hits with one-liners. If one fits, pivot to `ralphy template use <slug>` and skip improvisation entirely. (Templates encode the postmortem-validated workflow for that vibe — see `templates/CATEGORIES.md`.)
5. **Duration / clip count budget.** Most templates document `typicalDurationSec` + `typicalClipCount`. If the user picked a template, confirm; if not, default to ≤15s for first iteration, scale up after a successful test render.
6. **Hard constraints.** Banned words, music policy (Kling auto-soundtrack is enabled unless explicitly banned in prompt — kbo / glitter-cream), brand colors, etc.

For ambiguous one-liners ("сделай как Старый Спайс"), pull the canonical brand reference via `ralphy ref pull <url>` + `ralphy ref analyze-video <slug>` BEFORE drafting prompts. Don't improvise from memory (venom-bodywash postmortem: TV-commercial register vs still-photo register; ~$3 burn).

Keep the question set tight — 3-5 questions max in a single turn. Use `AskUserQuestion` with multiSelect when applicable. Sample first-turn template:

> "Quick intent capture before we start:
>  1. Target audience language? (EN / RU / KR / other)
>  2. Aspect? (9:16 / 16:9 / 1:1)
>  3. Brand or named person involved? If yes, drop a reference image / URL.
>  4. Duration ballpark? (5-10s test render / 15-30s standard / 60s+ long-form)
>  5. Any hard "no"s? (no music, no captions, specific banned vocabulary)"

## Step 2 — Plan + user approval

Once the questions land, draft a **plan** as a chat message — never a side file. Format:

```
## Plan for "<one-line title>"

**Vibe:** <2-3 sentences capturing what we're making>
**Template (if matched):** <slug> via `ralphy template use <slug>` OR "no template — vibe-style improvisation"
**Beat structure:**
  1. <beat one — duration — model — anchor>
  2. <beat two — ...>
  ...
**Stack:**
  - Image: <model>
  - Video: <model>
  - VO: <pipeline>
  - Music: <pipeline + policy>
**Estimated cost:** $<low> – $<high>
**Estimated wall-clock:** <minutes>
**First checkpoint:** scene-01 anchor → wait for your "go" before batching scenes 2-N
```

Stop there. **Wait for user "go" / "поехали" / equivalent before generating ANY paid asset.** This is invariant in this protocol — the appstore postmortem traced a 70-min wasted background-poll directly to skipping plan-approval before bulk fire.

If the user says "another approach" / "не так" / "this part is wrong", re-draft the plan from the user's correction. Don't dig in on the rejected approach.

## Step 3 — Step-by-step generation with checkpoints

After plan approval, generate **one beat at a time**, surfacing each to the user before the next:

1. **Anchor #1 = location-master-plate** (if any scene shares a setting). Show user → wait for "good" / "fix the couch" / etc. Without the location plate, every scene anchor invents a different room — noski-people-001 spent ~$4.50 + 45 min relearning this. Anchor #1 BEFORE any character or scene anchor.
2. **Character / persona masters.** One per cast member, each passed through with `--ref <location-master-plate>` for context. Wait for user yes/no.
3. **Scene anchors.** Generate scene-01 first → wait → scene-02 → wait → … Group into batches of 4-6 ONLY after at least 2 individual gens land with user approval.
4. **i2v clips.** Same cadence: scene-01-vid → check → scene-02-vid → check. Don't background-fire the whole batch.
5. **Music + VO.** After the visual cuts lock — never before, otherwise re-trim cascades into music re-sync (playdate-pixel-001).
6. **Caption pass.** `ralphy generate captions` on the locked VO files (per-slot now).
7. **Render** with `ralphy editor preflight <id>` first, then `ralphy render <id>`.
8. **Hand off** to `/ralph-evaluator` for the post-render quality gate.

Exception: the user explicitly says "не спрашивай каждый раз / fire the whole batch / больше так не делай по 1 штуке". Honor that and switch to batch mode for THAT project. Note the preference in memory for that project; don't generalize.

## Step 4 — Mid-flight corrections

When the user flags a problem mid-flight:

- **One retry on the same approach max.** If the second attempt also misses, **redesign the scene** instead of fighting model drift (glitter-cream-001 rule #7: kling fights between "jar near cheek" and "powder compact" basin → abandon and reframe). Surface the redesign to the user before generating.
- **Preserve old versions.** The CLI now auto-versions on regen (commit 753d2f7), so you don't need manual `cp`s. Don't pass `--force-overwrite` unless the user explicitly asks for legacy destructive behavior.
- **If the failure is novel** (not a known kling drift / privacy filter / etc), pause and ask the user what to try — don't burn another $0.40-$2 on a guess.

## Step 5 — Final gate before commit / push / share

Before declaring done:

1. Run `ralphy editor preflight <id>` — flags any aspect / fps / music-length divergence.
2. Run `ralphy project verify <id>` — flags any manifest/disk drift.
3. Run `/ralph-evaluator` skill on the final mp4 — produces `eval.json` + `eval-report.md`. Surface the report inline.
4. **Only after the eval lands**, ask the user "ready to ship / commit / push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## Cold-start template suggestion (04.04.01 + 04.04.03)

When the user's first utterance has no explicit template (no `ralphy template use <slug>`), do this BEFORE drafting a plan:

1. **Run `ralphy template suggest "<the user's brief>" --limit 3`.** The verb returns a ranked list with a `score` and a `tier` per result; `--threshold` defaults to 0.7 and triggers an LLM rerank on multilingual / paraphrase utterances.
2. **Read the top result.**
   - If `tier === "primary"` (top result is a strong match) → announce the pick inline and proceed: "Using the **<template>** template — `<one-line of what it does>`. Switch with `ralphy template use <other-slug>` if it's wrong." Then keep going. Do NOT ask "should I use this?" — the announce-and-proceed is the action; user interrupts if they disagree.
   - If `tier === "secondary"` (top result is a weak match) → list top-3 with one-liners and ask once: "These three are close — `<a>`, `<b>`, `<c>`. Which fits, or should I draft from scratch?"
   - If `tier === "fallback"` (top result is below confidence) → enter **free-form mode**. Say once: "No close template match — drafting from scratch with the vibe-style cookbook." Then jump to `docs/playbooks/scenarist.md` step "scenario-from-brief" and improvise. Do not re-run `template suggest`.
3. **Once a template is locked**, the rest of intake (steps 1-5 above) fills the gaps the template doesn't already encode (target audience language, brand-named-entity, banned words). Most other defaults come from `template.json`.

## Default-pick rules (04.03.02)

When a user request is concrete but doesn't specify a parameter, **pick the default and announce it**, never confirm:

| Missing | Default | Where it comes from |
|---|---|---|
| Template | `template suggest` top-1 if `tier === primary`, otherwise free-form | `ralphy template suggest` |
| Persona | The matched brand's `default_persona` if set; otherwise the closest archetype from `workspace/personas/ARCHETYPES.md` | `ralphy brand show <id>` → `persona` field |
| Duration | 15s | Intake step 5 default |
| Aspect | 9:16 unless the template hard-codes a different one | Intake step 1.2 |
| Music | Instrumental, ElevenLabs Music post-mix (Kling music disabled by default, per AGENTS invariant + venom-bodywash postmortem) | Intake step 6 + art-director playbook |
| Output language | Chat language unless the user names a different audience | Intake step 1.1 — but only as a *default*; ask if the brief is ambiguous (noski-people-001 trip-wire). |

Announce the pick once, then move on. **Do not** ask "shall I use 15s?" — say "Going 15s, 9:16, instrumental music — flag any of those if wrong."

## Clarification triage (04.03.01 + 04.03.03)

The intake protocol caps real questions at 5 per turn for legibility, BUT every question must name a specific decision and offer one or two defaults the user can accept. Three buckets:

1. **Infer (most cases).** Use the default-pick table above. Announce the pick and proceed; do not stall waiting for confirmation.
2. **Ask (rare but real).** Multiple distinct decisions are blocked by the same unknown, OR the brief contradicts a default the agent would otherwise pick (e.g. user said "60s long-form" but the template caps at 20s). Frame each question as "Decision: <X>. Default: <Y>. Override? __".
3. **Fail loudly (missing-and-irreplaceable).** The brief names a real entity but no reference is attached AND the user hasn't opted into `--no-ref-consent`. The reference-required gate refuses; do NOT improvise the entity from text alone (AGENTS invariant #3).

**Forbidden shapes** (the lint at `bun run lint:confirmation-shape` will flag these in playbooks; the agent must not emit them in chat either):

<!-- confirmation-shape-allow:section -->
```
"Should I proceed?"
"Shall I go ahead?"
"Would you like me to ..."
"Just to confirm, ..."
"I'll go ahead and ..."
"Мне продолжить?"
"Хочешь, чтобы я ...?"
"Продолжить?"
```
<!-- /confirmation-shape-allow:section -->

These add no information and break the one-beat-at-a-time loop. Replace with action statements: "Generating scene-01 now — flag if anything looks wrong." If the answer would unblock a distinct decision, ask a real question; otherwise just act.

## Ship (04.01.04)

"Ship it" / "поехали в финал" / "залей" is the explicit transition from iteration to final render. Mechanics:

1. **Reference-required gate re-check.** Before the final render, re-run `ralphy ref check <project-id>` to confirm any named real entity has a satisfied ref (or a logged `--no-ref-consent`). The intake-step ref check at step 1 may be stale if the scenario changed.
2. **Quality gates.** Run `ralphy editor preflight <id>` (aspect / fps / music-length divergence). The agent quality gates (`scoreScenario`, `scoreImage`, `scoreVideo`) refuse-not-warn per AGENTS invariant #4; if any fails twice in a row, stop and report concrete options — do not render mp4 over a failed gate. There is no model upgrade between draft and ship: best models are used throughout (AGENTS invariant + `04.0A.03`).
3. **Render.** `ralphy render <project-id>` → `workspace/projects/<id>/render/final.mp4`.
4. **Post-render eval.** Hand off to `/ralph-evaluator` for `eval.json` + `eval-report.md`. Surface the report inline.
5. **Authorize commit/push.** Only after the eval lands, ask once "ready to commit/push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## What's a "step" worth gating on?

The default cadence is **every paid generation OR every named scene**, whichever is shorter. As trust builds within a project (3+ scenes accepted in a row), you may batch the next 2-3 scenes together without waiting — but always return to single-step pacing the moment the user flags a miss.

For **template-driven** projects (`ralphy template use <slug>`), the template's `composition.md` or `TEMPLATE.md` may pre-define a tighter / looser pacing. Honor the template, but if the user says "по одной", you're back to scene-by-scene regardless of template default.

## Cross-references

- AGENTS.md routing — intake.md is the first row in the table for "new project" intent.
- `docs/playbooks/scenarist.md` — picks up after intake; receives the user-confirmed plan.
- `docs/playbooks/art-director.md` — receives the locked scenario + per-scene generation cadence.
- `docs/playbooks/producer.md` — orchestrates the end-to-end chain; references intake.md for the gate at every role-transition.
- `templates/CATEGORIES.md` — what to surface during the template-fit check (step 1.4).
- `MODELS.md` "Tried-and-dropped" table — what to avoid when picking the stack in step 2.
- All 10 project postmortems under `workspace/projects/<id>/postmortem/` or root `POSTMORTEM.md` — they exist BECAUSE skipping one of these gates cost real money. Re-read the closest sibling postmortem if you're about to skip a step.

---

**TL;DR for the impatient agent:** ask 3-5 questions → draft plan → wait for "go" → generate one scene → show → wait → repeat → final eval → ask before ship. Five postmortems independently traced their largest cost overruns to skipping this exact protocol.
