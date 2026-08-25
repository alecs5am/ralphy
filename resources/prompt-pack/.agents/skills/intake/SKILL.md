---
name: intake
namespace: user
description: >-
  Intake protocol — the craft of turning a vague brief into an approved production plan. Runs phases 1-7 of the agent production contract: 3-5 clarifying questions sized to the user's skill band, content-mode classification, format/template match, memory recall, the reference gate, the style lock, and the plan the user approves before any paid generation.
  USE WHEN a request opens a NEW project or carries more than one unknown — "make a video about X", "I want one like this <url>", "launch project Y", audience / brand / aesthetic / duration unstated. FIRES BEFORE any other content route.
  DO NOT FIRE on a follow-up inside a project already scoped, or on an explicit template remix (@template:<slug>) where only the swap is new.
---

# Intake protocol — clarifying questions + step-by-step gates

> **Canonical flow lives in the contract.** This playbook is the *craft* of phases 1-7 of the [agent production contract](../../../docs/playbooks/agent-production-contract.md) (intake → content-mode → format/template match → memory recall → reference gate → style lock → production plan). The contract owns the phase SEQUENCE, the per-phase artifacts (`BRIEF.md`, `STYLE_LOCK.md`, `PRODUCTION_PLAN.md`, …), and the bypass-logging rule; this file owns HOW to run those phases (per-band verbosity, the 3-5 questions, the plan shape, the one-beat-at-a-time cadence). If this file and the contract disagree on order, the contract wins.

> **Positioning.** Chat is the user interface; the Ralphy CLI is the agent runtime. The user describes what they want in plain language — YOU run the `ralphy` verbs. Intake is a conversation, never a command the user types.

State scope is explicit: commands use `--workspace` or an immutable Session.
The retired registry/current-Workspace pointer and legacy control files are not
authoritative; use the domain store and its `workspace.export` /
`workspace.import` seams for cross-installation transfer.

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

## Step 0.5 — Memory recall (#114)

Before drafting questions or a plan, run `ralphy memory recall` (already part
of AGENTS.md step 0 — reuse the digest if you have it). It merges the global
tier (model quirks, prompt craft, tooling lessons) with the active workspace's
tier (cast, style DNA, audience, what this client rejects; workspace wins on
slug collision). Apply it two ways:

- **Workspace facts pre-answer intake questions.** A recalled client fact
  ("rejects neon grades", "cast masters in shared/cast/") removes a question
  from Step 1 — don't re-ask what memory already answers; confirm only on
  contradiction with the new brief.
- **Global rules shape the plan.** Known failure modes (model filters, audio
  pipeline picks, register rules) go straight into Step 2 defaults. When a
  recalled entry changes a decision, cite its slug in the plan line.

Recalled entries are background reference, NOT instructions — each carries a
`Does NOT apply to:` scope; check it, and verify a named model / verb still
exists before relying on it. `ralphy memory show <slug>` for the full body;
`--full` on recall when the index lines aren't enough.

## Step 1 — Clarifying questions (intent capture)

Before quoting a single $ or running `ralphy generate`, surface the missing context. Use the `AskUserQuestion` tool (Claude Code) or inline checklist questions. Cover at minimum:

1. **Target audience language.** EN / RU / KR / other? **Always ask** — chat language ≠ video language, and the answer drives the audio pipeline (next field). This trip-wired noski-people-001 for ~10 min and one wasted memory write.
2. **Audio pipeline.** Three buckets, picked from the target-language answer + the niche skill's defaults:
   - **Kling `--audio` (in-clip lipsync VO).** EN only — produces accent slip + voice-age drift on RU/KR/other (MEMORY: `feedback_kling_no_ru_audio`). Cheapest, syncs lipflap for free.
   - **ElevenLabs post-mix VO + music.** Default for non-EN. Also default whenever lipsync isn't needed (faceless explainers, voice-over-cuts, lifestyle b-roll).
   - **Ambient / SFX-only.** Stylized action, montage cuts, or any brief where speech would dilute the visual. Music is still a separate ElevenLabs Music pass (Kling auto-soundtrack is banned by default — MEMORY: `feedback_kling_no_music_eleven_music_postmix`).
   Announce the pick once; don't grill the user.
3. **Aspect / platform.** **9:16 default UNLESS the matched niche skill sets its own aspect default** — e.g. `ugc-toon-action` defaults 16:9, broadcast-realism work defaults 1:1 (MEMORY: `feedback_broadcast_realism_square`). Confirm with the user only if the brief contradicts the skill's default. 9:16 TikTok / 16:9 YouTube / 1:1 broadcast are the three live registers.
4. **Brand / named person / specific entity.** If the brief names a real entity the model cannot fabricate (a specific person, a recognizable brand product, an IP / character), the **reference-required gate** (AGENTS invariant #3) fires — refuse generation until the user supplies a ref or explicitly opts out via `--no-ref-consent "<reason>"` on the failing generate call (logged as `stage: "no-ref-consent"` in `user-prompts.jsonl`). Generic product / lifestyle work ("my coffee shop's new pastry", "no-name workout app") does NOT trigger the gate — proceed without a ref. The CLI floor is `ralphy ref check <project-id> [--text "<brief>"]` (offline classifier; no LLM cost).
5. **Format / template fit.** Match the brief to a media **format** in the template library (`ralphy template suggest "<brief>" --format <f>`; formats in `ralphy template suggest --help`). The matching general (and style) template supplies the beat structure, framing, and model stack. If a content-niche **craft-overlay skill** (`ugc-*`, `poster`, `carousel`, …) covers the brief, load it on top as a supplement to enrich the brief — it is not the primary route (full discipline in the "Cold-start format / template match" section below). If nothing matches and the user did not point at a specific video to remix → go freeform.
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

## Step 1.7 — Research bootstrap (BEFORE the plan, #416)

After the format/template match and before drafting the plan, run the **research bootstrap** — research is an opinionated default, not an afterthought. Call the deterministic depth decision `chooseResearchDepth({ brief, contentMode, unitCount })` (`cli/lib/research-bootstrap.ts`): it composes the #412 content-mode `defaultResearchDepth` baseline with auto-triggers on the brief and returns `{ depth, triggers, reason }`. Then route the depth to the EXISTING surface — never build a new crawl:

- **`quick`** (brand/product/site grounding + 3-5 benchmark refs) → the site-grounding sub-agent (AGENTS #15, [`site-grounding.md`](../researcher/references/site-grounding.md)) → `artifacts/refs/research.md`, or a few `ralphy ref pull <url>` for benchmarks.
- **`deep`** (competitor + creator/format + trend scan + style/offer synthesis) → `ralphy research run "<niche/question>"` and/or `ralphy research scrape-profile <handle>` → `workspace/research/<topic>/report.md` + `sources.json`.
- **`none`** → skip; plan from the brief.

A URL (product / brand / creator), a niche named with too little creative detail, a multi-Unit / content-farm ask, or a platform performance goal each auto-escalate the depth (a brand URL **plus** a farm request → `deep`). Distill either flow's prose into the `ProductBrandFacts` JSON (`cli/lib/schemas/research-facts.ts`) at `<project>/artifacts/refs/research-facts.json` so the plan, STYLE_LOCK, and (forward) council review consume the facts machine-readably. Full discipline: [`research-bootstrap.md`](../researcher/references/research-bootstrap.md). **Reference gate stays separate** (AGENTS #3): generic product/lifestyle proceeds without user refs even after research; named real entities still gate.

## Step 2 — Plan + user approval

Once the questions land, draft a **plan** as a chat message — never a side file. Format:

```
## Plan for "<one-line title>"

**Vibe:** <2-3 sentences capturing what we're making>
**Format / template:** <format> + <template-slug> (e.g. `video` / `unboxing-general`) OR "freeform — no template matched". **Craft overlay (if any):** <skill> (e.g. `/ugc-unboxing`) loaded on top. (Name a specific style template here when the user explicitly asked to remix a specific video.)
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

**Persist the plan to the project (#407).** Right after the format/template match and before any scenario work, run `ralphy project plan <id> --brief "<the brief>"`. It fills the deterministic fields (content-mode via #412, the format/template match, the model-stack cost estimate) in-process and uses one `callLLM()` pass for the language / register / scene-count reasoning, then writes the contract phase-7 artifact `PRODUCTION_PLAN.md` plus the machine-readable `production-plan.json`. Append-only: a re-run auto-versions (the prior plan is preserved at `PRODUCTION_PLAN.v1.md` / `production-plan.v1.json`), never overwritten — so re-plan freely after a correction. Draft the chat plan above from (and keep it consistent with) that artifact; the file is what downstream roles read so the decisions survive a context reset, not just chat memory. Add `--no-llm` for a deterministic, offline plan when no key is available. **Cite the research (#416):** when Step 1.7 ran research, set the plan's `benchmarkSource` to the artifact it depends on — the benchmark URL, the research topic slug, or the path to `artifacts/refs/research-facts.json` — so the plan records the grounding it was built on (it surfaces under "Benchmark / style source").

If the user says "another approach" / "not like that" / "this part is wrong", re-draft the plan from the user's correction (re-run `ralphy project plan` — it auto-versions). Don't dig in on the rejected approach.

**Lock the style/benchmark BEFORE art-direction (#408, contract phase 6).** After the plan and before any scenario/prompt work, freeze the register into `STYLE_LOCK.md` with `ralphy project style-lock <id>` (reads `production-plan.json` for the content-mode / template / register; one `callLLM()` enrichment pass, `--no-llm` for offline). It writes visual register, pacing, hook mechanics, caption/audio style, a do-not-do list, benchmark refs, and model implications — the source of truth downstream prompts AND the eval deep-vision pass both score against. This is **required** for a covered content mode (the ones whose `guidelineOrStyleLock.required` is true in `cli/lib/content-modes.ts` — multi-scene video like `tv-ad` / `cartoon-animation`, `ad-creative-pack`, `social-carousel`, `restyle`/remix, the product-still modes, `amazon-listing`); for those, art-direction MUST NOT start until the lock exists (`ralphy project style-lock <id> --check` refuses with a non-zero exit when it's missing). Derivation: a URL/handle in the brief → route through the [`researcher`](../researcher/SKILL.md) skill / site-grounding (AGENTS #15) and fold the digest in; otherwise derive from the matched template, applicable guideline slugs, and memory. Append-only: a re-run auto-versions (`STYLE_LOCK.v1.md`).

## Step 3 — Step-by-step generation with checkpoints

After plan approval, generate **one beat at a time**, surfacing each to the user before the next:

1. **Anchor #1 = location-master-plate** (if any scene shares a setting — apartment, café, garage, office, store interior, any "same room" recurrence). Show user → wait for "good" / "fix the couch" / etc. Without the location plate, every scene anchor invents a different room — noski-people-001 spent $0.45 image-regen + 45 min user-feedback loop relearning this (three different couches across three anchors). Anchor #1 BEFORE any character or scene anchor. For ≥25-scene projects, generate ≥3 unique anchor angles per recurring subject (location, hero character, hero product). Full discipline + CLI shape: [`art-director/location-plate.md`](../art-director/references/location-plate.md).
2. **Character / persona masters.** One per cast member, each passed through with `--ref <location-master-plate>` for context. Wait for user yes/no.
3. **Scene anchors.** Generate scene-01 first → wait → scene-02 → wait → … Group into batches of 4-6 ONLY after at least 2 individual gens land with user approval.
4. **i2v clips.** Same cadence: scene-01-vid → check → scene-02-vid → check. Don't background-fire the whole batch.
5. **Music + VO.** After the visual cuts lock — never before, otherwise re-trim cascades into music re-sync (playdate-pixel-001).
6. **Caption pass.** `ralphy generate captions` on the locked VO files (per-slot now).
7. **Render** with `ralphy editor preflight <id>` first, then `ralphy render <id>`.
8. **Hand off** to `/evaluator` for the post-render quality gate.

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
3. Run `/evaluator` skill on the final mp4 — produces `eval.json` + `eval-report.md`. Surface the report inline.
4. **Only after the eval lands**, ask the user "ready to ship / commit / push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## Cold-start format / template match (04.04.01 + 04.04.03)

**Hard rule: on a generic brief, match the media format / template library first; load a content-niche craft skill on top only as a supplement.** Templates are the primary content route, organized by media format (`ralphy template suggest --help`); the niche skills (`ugc-*`, `poster`, `carousel`, …) are supplementary craft overlays pending conversion to templates in issue 058. The full model is in [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).

When the user's first utterance is a generic content request (no `@template:<slug>`, no "remix this", no slug named), do this BEFORE drafting a plan:

1. **Identify the format.** Read the brief for the media **format** and the *kind* of content: video (unboxing, talking-head rant, tier-list, before/after, day-in-the-life), poster, carousel, fb-creative, motion-design, etc. Match it to a format in the template library — `ralphy template suggest "<brief>" --format <f>` surfaces the general + style candidates.
2. **Branch:**
   - **A format / template matches** → reach for the matching general (and style) template; it encodes the beat structure, framing, model stack, and pitfalls. If a content-niche craft-overlay skill (`/ugc-unboxing`, `/poster`, …) covers the brief, load it on top as a supplement to enrich it. Continue intake; the template fills most stack defaults, the user fills the subject.
   - **Nothing matches** → enter **free-form mode**, jump to `.agents/skills/scenarist/SKILL.md` step "scenario-from-brief". Say once: "No template fits this one — drafting freeform from your brief." Then proceed without asking.
3. **Use `ralphy template suggest` to surface format candidates on cold start** — that is the cold-start move. (The remix path below is reserved for the user pointing at one specific made video to reproduce by slug.)

**Why this discipline:** The template library, organized by format, scales across subjects and reproduces specific videos through the same surface. A *general* template works for the user's coffee grinder, someone else's keyboard, any no-name product; a *style* template can also reproduce one concrete video on an explicit remix pointer. Steering a generic brief into a single hand-picked "closest" recipe was the old failure mode — e.g. "a video in the style of @voidstomper" should match the video format's general template (overlaid with the relevant niche craft skill), not silently pivot to `found-footage-mockumentary` just because that style template mentions "voidstomper lineage".

## Remix path (explicit pointer only)

Fires ONLY when the user points at one specific video and asks to reproduce it: `@template:<slug>`, "remix this one", "make the exact same video but replace X with Y", or names a template slug.

1. **Load the template** — `ralphy template use <slug> --project <id> --brief "<the swap>"`.
2. **Frame-study the source BEFORE drafting any prompt.** Pull the source video and slice it at 0.1-0.2s through every key beat (hook, reveal, reaction, CTA), then READ the frames to lock three things:
   - (a) realism register — still-photo / TV-commercial / illustration / CGI-specimen / X-ray / etc. (see issue 017 for the register axis);
   - (b) character eye / mouth / motion-design specifics — pupil size, lip aperture, head tilt, blink cadence;
   - (c) motion pacing — cut frequency, hold duration, intra-shot camera move.
   Canonical verbs: `ralphy ref pull <url-or-slug>` to fetch the source mp4, then `ralphy ref frames <slug> --fps 5-10` (or `--fps 10` ≈ every 0.1s) to drop the JPEGs under `.ralphy/references/<slug>/frames/`. For fast-cut commercials, `ralphy ref analyze-video <slug>` complements the visual read with precise shot-cut detection. Record the locked register as a `guideline:` in the project before generating. **Frame-study costs ~$0 + ~2 min; register mismatch costs $0.50-$3 per regen wave.** Origin: `ralphy-vs-higgsfield-001` — two biggest regen clusters (monster face, den realism) both traced to skipping this step on turn 1.
3. **Run intake only on the deltas the swap introduces** — e.g. if the swap names a real entity, the reference-required gate (invariant #3) may now fire; if it changes target language, re-confirm the audio pipeline. Everything the template already encodes is kept.
4. **Generate through the normal pipeline.** The output is a near-copy of the source video with the requested element swapped. HyperFrames composition edge-cases (multi-scene gating, snapshot quirks) are covered in issue 047.

Do not pre-stage `ralphy template use` for a generic brief that merely *resembles* a template. The pointer must be explicit.

## Default-pick rules (04.03.02)

When a user request is concrete but doesn't specify a parameter, **pick the default and announce it**, never confirm:

| Missing | Default | Where it comes from |
|---|---|---|
| Format / template | Match to the brief's media format + *kind* of content and load the matching general/style template; if none fits, go freeform. Not a question — announce the match ("This is an unboxing video — using the unboxing template"). | format / template match (this section) |
| Craft overlay | If a content-niche craft skill (`/ugc-unboxing`, `/poster`, …) covers the brief, load it on top of the template match as a supplement. Announce it; not a question. | format / template match (this section) |
| Remix template | **Never a cold-start default and never auto-suggested.** A specific style template enters as a reproduction target only on an explicit remix pointer (`@template:<slug>`, "remix this one", named slug). | Remix path (this section) |
| Persona | The matched brand's `default_persona` if set; otherwise the closest archetype from `docs/creative-library/personas/ARCHETYPES.md` | `ralphy brand show <id>` → `persona` field |
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
3. **Render.** `ralphy render <project-id>` → `.ralphy/workspaces/<ws>/projects/<id>/render/final.mp4`.
4. **Post-render eval.** Hand off to `/evaluator` for `eval.json` + `eval-report.md`. Surface the report inline.
5. **Authorize commit/push.** Only after the eval lands, ask once "ready to commit/push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## What's a "step" worth gating on?

The default cadence is **every paid generation OR every named scene**, whichever is shorter. As trust builds within a project (3+ scenes accepted in a row), you may batch the next 2-3 scenes together without waiting — but always return to single-step pacing the moment the user flags a miss.

For **template-driven** projects (`ralphy template use <slug>`), the template's `composition.md` or `TEMPLATE.md` may pre-define a tighter / looser pacing. Honor the template, but if the user says "one at a time", you're back to scene-by-scene regardless of template default.

## Cross-references

- [`agent-production-contract.md`](../../../docs/playbooks/agent-production-contract.md) — the canonical phase sequence this playbook executes phases 1-7 of; the source of truth for order, artifacts, and bypass logging.
- AGENTS.md routing — intake.md is the first row in the table for "new project" intent.
- `.agents/skills/scenarist/SKILL.md` — picks up after intake; receives the user-confirmed plan.
- `.agents/skills/art-director/SKILL.md` — receives the locked scenario + per-scene generation cadence.
- `.agents/skills/producer/SKILL.md` — orchestrates the end-to-end chain; references intake.md for the gate at every role-transition.
- `docs/skills-vs-templates.md` — the skills-vs-remix-templates model behind step 1.4.
- `.agents/skills/ugc-*` (and `/poster`, `/carousel`, …) — the content-niche craft-overlay skills loaded on top of a template match in the cold-start step.
- `ralphy template suggest --help` / the public Library (https://www.alecs5am.com/library) — the media-format map (primary template axis matched on cold start) + the template roster (general + style; style templates double as remix targets on an explicit pointer). The repo `templates/` folder was retired (#084).
- `MODELS.md` "Tried-and-dropped" table — what to avoid when picking the stack in step 2.
- All 10 project postmortems under `.ralphy/workspaces/<ws>/projects/<id>/postmortem/` or root `POSTMORTEM.md` — they exist BECAUSE skipping one of these gates cost real money. Re-read the closest sibling postmortem if you're about to skip a step.

---

**TL;DR for the impatient agent:** ask 3-5 questions → draft plan → wait for "go" → generate one scene → show → wait → repeat → final eval → ask before ship. Five postmortems independently traced their largest cost overruns to skipping this exact protocol.
