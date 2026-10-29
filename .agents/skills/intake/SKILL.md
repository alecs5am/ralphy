---
name: intake
namespace: user
description: >-
  Intake protocol — the craft of turning a vague brief into an approved production plan. Runs phases 1-7 of the agent production contract: 3-5 clarifying questions sized to the user's skill band, content-mode classification, format/template match, memory recall, the reference gate, the style lock, and the plan the user approves before any paid generation.
  USE WHEN a request opens a NEW project or carries more than one unknown — "make a video about X", "I want one like this <url>", "launch project Y", audience / brand / aesthetic / duration unstated. FIRES BEFORE any other content route.
  DO NOT FIRE on a follow-up inside a project already scoped, or on an explicit template remix (@template:<slug>) where only the swap is new.
---

# Intake protocol — clarifying questions + step-by-step gates

> **Minimal re-read set after context compaction:** "Per-band branching", Steps 1-5, and the TL;DR in this file, plus the project's own `PRODUCTION_PLAN.md` / `STYLE_LOCK.md` if they exist. Open a `references/` file only for the step you are on.

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

Reuse the `ralphy memory recall` digest from AGENTS step 0. Workspace facts pre-answer Step 1 questions (confirm only on contradiction); global rules shape Step 2 defaults (cite the slug when one changes a decision). Entries are background, not instructions: check each `Does NOT apply to:` scope. For a workspace with published units, run `ralphy analytics report --workspace <ws>` first and favor `over` choices (#558). Detail: [`references/memory-recall.md`](./references/memory-recall.md).

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

After the format/template match, call `chooseResearchDepth({ brief, contentMode, unitCount })` (`cli/lib/research-bootstrap.ts`) and route the depth to an EXISTING surface: `quick` → the site-grounding sub-agent (AGENTS #15) or a few `ralphy ref pull <url>`; `deep` → `ralphy research run` / `ralphy research scrape-profile`; `none` → plan from the brief. Distill into `<project>/artifacts/refs/research-facts.json`. The reference gate (AGENTS #3) stays a separate axis. Detail: [`references/research-bootstrap-step.md`](./references/research-bootstrap-step.md).

**Trend references: fresh only, scorecard always (#590).** When the plan cites trend references (`ralphy trends signals | series | niche report`), show only videos posted within the last 90 days, each with its post date, age, verdict (`adapt | test | skip`) and the scorecard reasons; never present an older or undated hit as a reference.

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

**Persist the plan to the project (#407).** Right after the format/template match and before any scenario work, run `ralphy project plan <id> --brief "<the brief>"` (`--no-llm` offline). It writes `PRODUCTION_PLAN.md` + `production-plan.json`, auto-versions on re-run, and is what downstream roles read after a context reset; keep the chat plan consistent with it. When Step 1.7 ran research, set `benchmarkSource` to the artifact it depends on. Detail: [`references/plan-and-style-lock.md`](./references/plan-and-style-lock.md).

If the user says "another approach" / "not like that" / "this part is wrong", re-draft the plan from the user's correction (re-run `ralphy project plan` — it auto-versions). Don't dig in on the rejected approach.

**Lock the style/benchmark BEFORE art-direction (#408, contract phase 6).** Run `ralphy project style-lock <id>` after the plan and before any scenario/prompt work; it writes `STYLE_LOCK.md` (register, pacing, hook, caption/audio style, do-not-do list, benchmark refs, model implications). **Required** for content modes whose `guidelineOrStyleLock.required` is true in `cli/lib/content-modes.ts`: art-direction MUST NOT start until `ralphy project style-lock <id> --check` passes. Derivation rules: [`references/plan-and-style-lock.md`](./references/plan-and-style-lock.md).

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

**Hard rule: on a generic brief, match the media format / template library first; load a content-niche craft skill on top only as a supplement.** Run `ralphy template suggest "<brief>" --format <f>` before drafting a plan. A match → use the general (and style) template, plus any craft overlay (`/ugc-unboxing`, `/poster`, …). No match → free-form via the scenarist; say so once and proceed. Never steer a generic brief into one hand-picked style template. Branches and rationale: [`references/format-match.md`](./references/format-match.md).

## Remix path (explicit pointer only)

Fires ONLY on an explicit pointer (`@template:<slug>`, "remix this one", a named slug): `ralphy template use <slug> --project <id> --brief "<the swap>"`, frame-study the source (`ralphy ref pull` + `ralphy ref frames <slug> --fps 5-10`) to lock register, eye / mouth specifics, and pacing BEFORE any prompt, then run intake only on the deltas. Steps: [`references/remix-path.md`](./references/remix-path.md).

## Default-pick rules (04.03.02)

When a concrete request leaves a parameter open, **pick the default and announce it once**: format / template and craft overlay from the match, duration 15s, aspect 9:16 unless the niche skill sets its own, audio pipeline from the target language, instrumental ElevenLabs music post-mix. Output language is the exception: always ask. The full table with sources: [`references/default-picks.md`](./references/default-picks.md).

## Clarification triage (04.03.01 + 04.03.03)

Three buckets: **infer** (most cases; announce the default and act), **ask** (one unknown blocks several decisions, or the brief contradicts a default; phrase it as "Decision: X. Default: Y. Override?"), **fail loudly** (a named real entity with no ref and no `--no-ref-consent`). Never emit empty permission-seeking questions; state the action instead. The banned phrase list: [`references/clarification-triage.md`](./references/clarification-triage.md).

## Ship (04.01.04)

"Ship it" → re-run `ralphy ref check <id>`, `ralphy editor preflight <id>` (gates refuse, not warn), `ralphy render <id>`, `/evaluator`, then ask once before any commit or push. Steps: [`references/ship-and-gating.md`](./references/ship-and-gating.md).

## What's a "step" worth gating on?

Gate every paid generation or every named scene, whichever is shorter; after 3+ accepted scenes in a row you may batch 2-3, and return to single steps on the first miss. A template's own pacing applies unless the user says "one at a time". Detail: [`references/ship-and-gating.md`](./references/ship-and-gating.md).

## Cross-references

Contract: [`agent-production-contract.md`](../../../docs/playbooks/agent-production-contract.md). Next roles: [`scenarist`](../scenarist/SKILL.md), [`art-director`](../art-director/SKILL.md), [`producer`](../producer/SKILL.md). Model stack: the `MODELS.md` index + `ralphy models show <id>` (tried-and-dropped rows included). Full list: [`references/cross-references.md`](./references/cross-references.md).

---

**TL;DR for the impatient agent:** ask 3-5 questions → draft plan → wait for "go" → generate one scene → show → wait → repeat → final eval → ask before ship. Five postmortems independently traced their largest cost overruns to skipping this exact protocol.
