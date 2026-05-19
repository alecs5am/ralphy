# Intake protocol — clarifying questions + step-by-step gates

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
3. **Brand / named person / specific entity.** If yes, the **reference-required gate** (AGENTS invariant #3) fires — refuse generation until the user supplies a ref or explicitly opts out with "generate without reference, I understand the quality will be worse" (logged as `stage: "no-ref-consent"`).
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
