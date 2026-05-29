# Intake protocol — clarifying questions + step-by-step gates

> **Adaptive verbosity.** The intake's depth scales with the user's skill score (0-10) and developer badge from `ralphy whoami` (read on session start per AGENTS.md step 0). The same protocol runs at every level, but novice gets explanations after each step, expert gets one-line confirmations. See the band table below.

## Per-band branching (read this BEFORE step 1)

| Band | Score | Behavior |
|---|---|---|
| **novice** | 0-1.9 | Full intake with mini-lectures after each step. Explain "WHY we ask about target language", "WHY location-master-plate first", "WHAT auto-versioning means". Show one tutorial concept per generation step. Slow but builds intuition. |
| **learning** | 2.0-3.9 | Full intake (5 questions). Inline "why" only on the first occurrence of a concept this session. No tutorial concepts; let user ask. |
| **intermediate** | 4.0-5.9 | Full intake (5 questions). No "why" unless user flags confusion. Step-by-step with one-beat-at-a-time gates. |
| **comfortable** | 6.0-7.9 | Full intake but tighter (3-5 questions, skip obvious ones if `preferences.default_*` is set). Batch 4-6 gens after 2 solo approvals. |
| **experienced** | 8.0-9.9 | Compact intake: only critical params (brand / aspect / target_language). Batch by default; user opts into single-step with "one at a time". |
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
- "Make a video about X"
- "I want it like this one" + URL or screenshot
- "I want something like <vague aesthetic>"
- "Start project <name>"
- Any brief with > 1 unknown (target audience? brand? characters? aesthetic? duration?)

NEVER fires when:
- User explicitly says "just generate", "don't ask", "let's go".
- User picked a specific template via `ralphy template use <slug>` — the template encodes most decisions; only fill in remaining slots.
- Request is a single asset (`ralphy generate image ...`), an edit ("rework scene 3"), or a debug ask.

## Step 1 — Clarifying questions (intent capture)

Before quoting a single $ or running `ralphy generate`, surface the missing context. Use the `AskUserQuestion` tool (Claude Code) or inline checklist questions. Cover at minimum:

1. **Target audience language.** EN / RU / KR / other? **Always ask** — chat language ≠ video language, and the answer drives the audio pipeline (next field). This trip-wired noski-people-001 for ~10 min and one wasted memory write.
2. **Audio pipeline.** Three buckets, picked from the target-language answer + the niche skill's defaults:
   - **Kling `--audio` (in-clip lipsync VO).** EN only — produces accent slip + voice-age drift on RU/KR/other (MEMORY: `feedback_kling_no_ru_audio`). Cheapest, syncs lipflap for free.
   - **ElevenLabs post-mix VO + music.** Default for non-EN. Also default whenever lipsync isn't needed (faceless explainers, voice-over-cuts, lifestyle b-roll).
   - **Ambient / SFX-only.** Stylized action, montage cuts, or any brief where speech would dilute the visual. Music is still a separate ElevenLabs Music pass (Kling auto-soundtrack is banned by default — MEMORY: `feedback_kling_no_music_eleven_music_postmix`).
   Announce the pick once; don't grill the user.
3. **Aspect / platform.** **9:16 default UNLESS the matched niche skill sets its own aspect default** — e.g. `ralphy-ugc-toon-action` defaults 16:9, broadcast-realism work defaults 1:1 (MEMORY: `feedback_broadcast_realism_square`). Confirm with the user only if the brief contradicts the skill's default. 9:16 TikTok / 16:9 YouTube / 1:1 broadcast are the three live registers.
4. **Brand / named person / specific entity.** If the brief names a real entity the model cannot fabricate (a specific person, a recognizable brand product, an IP / character), the **reference-required gate** (AGENTS invariant #3) fires — refuse generation until the user supplies a ref or explicitly opts out via `--no-ref-consent "<reason>"` on the failing generate call (logged as `stage: "no-ref-consent"` in `user-prompts.jsonl`). Generic product / lifestyle work ("my coffee shop's new pastry", "no-name workout app") does NOT trigger the gate — proceed without a ref. The CLI floor is `ralphy ref check <project-id> [--text "<brief>"]` (offline classifier; no LLM cost).
5. **Niche-skill fit.** Match the brief to a niche skill (`/ralphy-ugc-*`) — the generalized "how to make a `<niche>` video" overlay. If one fits, load it and run the normal pipeline. Do **not** run `ralphy template suggest` to find "something close" — templates are remix-only (full discipline in the "Cold-start niche-skill match" section below). If no skill fits and the user did not point at a specific video to remix → go freeform.
6. **Duration / clip count budget.** Most templates document `typicalDurationSec` + `typicalClipCount`. If the user picked a template, confirm; if not, default to ≤15s for first iteration, scale up after a successful test render.
7. **Hard constraints.** Banned words, music policy (Kling auto-soundtrack is enabled unless explicitly banned in prompt — kbo / glitter-cream), brand colors, etc.

For ambiguous one-liners ("make it like Old Spice"), pull the canonical brand reference via `ralphy ref pull <url>` + `ralphy ref analyze-video <slug>` BEFORE drafting prompts. Don't improvise from memory (venom-bodywash postmortem: TV-commercial register vs still-photo register; ~$3 burn).

Keep the question set tight — 3-5 questions max in a single turn. Use `AskUserQuestion` with multiSelect when applicable. Sample first-turn template:

> "Quick intent capture before we start:
>  1. Target audience language? (EN / RU / KR / other) — drives the audio pipeline.
>  2. Aspect? (9:16 / 16:9 / 1:1 — default per matched niche skill if any.)
>  3. Brand or named person involved? If yes, drop a reference image / URL.
>  4. Duration ballpark? (5-10s test render / 15-30s standard / 60s+ long-form)
>  5. Any hard "no"s? (no music, no captions, specific banned vocabulary)"

## Step 2 — Plan + user approval

Once the questions land, draft a **plan** as a chat message — never a side file. Format:

```
## Plan for "<one-line title>"

**Vibe:** <2-3 sentences capturing what we're making>
**Niche skill (if matched):** <skill> (e.g. `/ralphy-ugc-unboxing`) OR "freeform — no niche skill matched". (Only name a template here if the user explicitly asked to remix a specific video.)
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

Stop there. **Wait for user "go" / "let's go" / equivalent before generating ANY paid asset.** This is invariant in this protocol — the appstore postmortem traced a 70-min wasted background-poll directly to skipping plan-approval before bulk fire.

If the user says "another approach" / "not like that" / "this part is wrong", re-draft the plan from the user's correction. Don't dig in on the rejected approach.

## Step 3 — Step-by-step generation with checkpoints

After plan approval, generate **one beat at a time**, surfacing each to the user before the next:

1. **Anchor #1 = location-master-plate** (if any scene shares a setting — apartment, café, garage, office, store interior, any "same room" recurrence). Show user → wait for "good" / "fix the couch" / etc. Without the location plate, every scene anchor invents a different room — noski-people-001 spent $0.45 image-regen + 45 min user-feedback loop relearning this (three different couches across three anchors). Anchor #1 BEFORE any character or scene anchor. For ≥25-scene projects, generate ≥3 unique anchor angles per recurring subject (location, hero character, hero product). Full discipline + CLI shape: [`art-director/location-plate.md`](art-director/location-plate.md).
2. **Character / persona masters.** One per cast member, each passed through with `--ref <location-master-plate>` for context. Wait for user yes/no.
3. **Scene anchors.** Generate scene-01 first → wait → scene-02 → wait → … Group into batches of 4-6 ONLY after at least 2 individual gens land with user approval.
4. **i2v clips.** Same cadence: scene-01-vid → check → scene-02-vid → check. Don't background-fire the whole batch.
5. **Music + VO.** After the visual cuts lock — never before, otherwise re-trim cascades into music re-sync (playdate-pixel-001).
6. **Caption pass.** `ralphy generate captions` on the locked VO files (per-slot now).
7. **Render** with `ralphy editor preflight <id>` first, then `ralphy render <id>`.
8. **Hand off** to `/ralphy-evaluator` for the post-render quality gate.

Exception: the user explicitly says "stop asking every time / fire the whole batch / don't do them one at a time anymore". Honor that and switch to batch mode for THAT project. Note the preference in memory for that project; don't generalize.

## Step 4 — Mid-flight corrections

When the user flags a problem mid-flight:

- **One retry on the same approach max.** If the second attempt also misses, **redesign the scene** instead of fighting model drift (glitter-cream-001 rule #7: kling fights between "jar near cheek" and "powder compact" basin → abandon and reframe). Surface the redesign to the user before generating.
- **Preserve old versions.** The CLI now auto-versions on regen (commit 753d2f7), so you don't need manual `cp`s. Don't pass `--force-overwrite` unless the user explicitly asks for legacy destructive behavior.
- **If the failure is novel** (not a known kling drift / privacy filter / etc), pause and ask the user what to try — don't burn another $0.40-$2 on a guess.

## Step 5 — Final gate before commit / push / share

Before declaring done:

1. Run `ralphy editor preflight <id>` — flags any aspect / fps / music-length divergence.
2. Run `ralphy project verify <id>` — flags any manifest/disk drift.
3. Run `/ralphy-evaluator` skill on the final mp4 — produces `eval.json` + `eval-report.md`. Surface the report inline.
4. **Only after the eval lands**, ask the user "ready to ship / commit / push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## Cold-start niche-skill match (04.04.01 + 04.04.03)

**Hard rule: on a generic brief, match a niche skill — never auto-suggest a template.** A template is a single concrete video, used only for explicit remix (see "Remix path" below). Forcing a generic brief into a pre-made template produces off-brand, samey output. The full model is in [`docs/skills-vs-templates.md`](../skills-vs-templates.md).

When the user's first utterance is a generic video request (no `@template:<slug>`, no "remix this", no slug named), do this BEFORE drafting a plan:

1. **Identify the niche.** Read the brief for the *kind* of video: unboxing, talking-head rant, tier-list, before/after, day-in-the-life, etc. Match it to a niche skill (`/ralphy-ugc-*`). The skills are discoverable in `.agents/skills/` (and Claude Code's slash menu).
2. **Branch:**
   - **Niche skill matches** → load it as the domain overlay (it encodes the beat structure, framing, model stack, and pitfalls for that niche) and continue intake; the skill fills most stack defaults, the user fills the subject.
   - **No niche skill matches** → enter **free-form mode**, jump to `docs/playbooks/scenarist.md` step "scenario-from-brief". Say once: "No niche skill fits this one — drafting freeform from your brief." Then proceed without asking.
3. **Do NOT run `ralphy template suggest`** on cold start. It is for remix-shopping only (the user browsing the library for a specific video to reproduce).

**Why this discipline:** A niche skill generalizes — it works for the user's coffee grinder, someone else's keyboard, any no-name product. A template answers a different question ("I want *this* exact video"). Suggesting a template for "make a video about X" is a category error: it answers a question the user didn't ask, and routes a custom brief into a one-off mold — e.g. "a video in the style of @voidstomper" should NOT pivot to `found-footage-mockumentary` just because the template mentions "voidstomper lineage".

## Remix path (explicit pointer only)

Fires ONLY when the user points at one specific video and asks to reproduce it: `@template:<slug>`, "remix this one", "make the exact same video but replace X with Y", or names a template slug.

1. **Load the template** — `ralphy template use <slug> --project <id> --brief "<the swap>"`.
2. **Frame-study the source BEFORE drafting any prompt.** Pull the source video and slice it at 0.1-0.2s through every key beat (hook, reveal, reaction, CTA), then READ the frames to lock three things:
   - (a) realism register — still-photo / TV-commercial / illustration / CGI-specimen / X-ray / etc. (see issue 017 for the register axis);
   - (b) character eye / mouth / motion-design specifics — pupil size, lip aperture, head tilt, blink cadence;
   - (c) motion pacing — cut frequency, hold duration, intra-shot camera move.
   Canonical verbs: `ralphy ref pull <url-or-slug>` to fetch the source mp4, then `ralphy ref frames <slug> --fps 5-10` (or `--fps 10` ≈ every 0.1s) to drop the JPEGs under `workspace/references/<slug>/frames/`. For fast-cut commercials, `ralphy ref analyze-video <slug>` complements the visual read with precise shot-cut detection. Record the locked register as a `guideline:` in the project before generating. **Frame-study costs ~$0 + ~2 min; register mismatch costs $0.50-$3 per regen wave.** Origin: `ralphy-vs-higgsfield-001` — two biggest regen clusters (monster face, den realism) both traced to skipping this step on turn 1.
3. **Run intake only on the deltas the swap introduces** — e.g. if the swap names a real entity, the reference-required gate (invariant #3) may now fire; if it changes target language, re-confirm the audio pipeline. Everything the template already encodes is kept.
4. **Generate through the normal pipeline.** The output is a near-copy of the source video with the requested element swapped. HyperFrames composition edge-cases (multi-scene gating, snapshot quirks) are covered in issue 047.

Do not pre-stage `ralphy template use` for a generic brief that merely *resembles* a template. The pointer must be explicit.

## Default-pick rules (04.03.02)

When a user request is concrete but doesn't specify a parameter, **pick the default and announce it**, never confirm:

| Missing | Default | Where it comes from |
|---|---|---|
| Niche skill | Match to the brief's *kind* of video and load it; if none fits, go freeform. Not a question — announce the match ("This is an unboxing — using the unboxing skill"). | niche-skill match (this section) |
| Template | **Never a default and never auto-suggested.** A template enters only on an explicit remix pointer (`@template:<slug>`, "remix this one", named slug). | Remix path (this section) |
| Persona | The matched brand's `default_persona` if set; otherwise the closest archetype from `workspace/personas/ARCHETYPES.md` | `ralphy brand show <id>` → `persona` field |
| Duration | 15s | Intake step 6 default |
| Aspect | 9:16 UNLESS the matched niche skill sets its own default (e.g. toon-action → 16:9, broadcast-realism → 1:1) OR the user explicitly remixes a template that hard-codes one | Intake step 3 |
| Audio pipeline | Kling `--audio` if target language is EN AND the niche calls for lipsync; ElevenLabs post-mix VO+music for non-EN or faceless; ambient/SFX-only for stylized action | Intake step 2 |
| Music | Instrumental, ElevenLabs Music post-mix (Kling music disabled by default, per AGENTS invariant + venom-bodywash postmortem) | Intake step 7 + art-director playbook |
| Output language | **Always ask** — chat language ≠ video language (noski-people-001 trip-wire). | Intake step 1 |

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
"Should I continue?"
"Do you want me to ...?"
"Keep going?"
```
<!-- /confirmation-shape-allow:section -->

These add no information and break the one-beat-at-a-time loop. Replace with action statements: "Generating scene-01 now — flag if anything looks wrong." If the answer would unblock a distinct decision, ask a real question; otherwise just act.

## Ship (04.01.04)

"Ship it" / "let's go to the final" / "publish it" is the explicit transition from iteration to final render. Mechanics:

1. **Reference-required gate re-check.** Before the final render, re-run `ralphy ref check <project-id>` to confirm any named real entity has a satisfied ref (or a logged `--no-ref-consent`). The intake-step ref check at step 1 may be stale if the scenario changed.
2. **Quality gates.** Run `ralphy editor preflight <id>` (aspect / fps / music-length divergence). The agent quality gates (`scoreScenario`, `scoreImage`, `scoreVideo`) refuse-not-warn per AGENTS invariant #4; if any fails twice in a row, stop and report concrete options — do not render mp4 over a failed gate. There is no model upgrade between draft and ship: best models are used throughout (AGENTS invariant + `04.0A.03`).
3. **Render.** `ralphy render <project-id>` → `workspace/projects/<id>/render/final.mp4`.
4. **Post-render eval.** Hand off to `/ralphy-evaluator` for `eval.json` + `eval-report.md`. Surface the report inline.
5. **Authorize commit/push.** Only after the eval lands, ask once "ready to commit/push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## What's a "step" worth gating on?

The default cadence is **every paid generation OR every named scene**, whichever is shorter. As trust builds within a project (3+ scenes accepted in a row), you may batch the next 2-3 scenes together without waiting — but always return to single-step pacing the moment the user flags a miss.

For **template-driven** projects (`ralphy template use <slug>`), the template's `composition.md` or `TEMPLATE.md` may pre-define a tighter / looser pacing. Honor the template, but if the user says "one at a time", you're back to scene-by-scene regardless of template default.

## Cross-references

- AGENTS.md routing — intake.md is the first row in the table for "new project" intent.
- `docs/playbooks/scenarist.md` — picks up after intake; receives the user-confirmed plan.
- `docs/playbooks/art-director.md` — receives the locked scenario + per-scene generation cadence.
- `docs/playbooks/producer.md` — orchestrates the end-to-end chain; references intake.md for the gate at every role-transition.
- `docs/skills-vs-templates.md` — the skills-vs-remix-templates model behind step 1.4.
- `.agents/skills/ralphy-ugc-*` — the niche skills matched in the cold-start step.
- `templates/CATEGORIES.md` — the remix-template roster (used only on an explicit remix pointer).
- `MODELS.md` "Tried-and-dropped" table — what to avoid when picking the stack in step 2.
- All 10 project postmortems under `workspace/projects/<id>/postmortem/` or root `POSTMORTEM.md` — they exist BECAUSE skipping one of these gates cost real money. Re-read the closest sibling postmortem if you're about to skip a step.

---

**TL;DR for the impatient agent:** ask 3-5 questions → draft plan → wait for "go" → generate one scene → show → wait → repeat → final eval → ask before ship. Five postmortems independently traced their largest cost overruns to skipping this exact protocol.
