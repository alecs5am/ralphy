# Agent production contract — the canonical chat-to-render flow

> **This is the single source of truth for the phase sequence every "make content" request follows.** Intake, producer, scenarist, art-director, editor, evaluator, and the memory loop all execute slices of this contract — they do not define their own divergent sequences. When a playbook and this contract disagree on ORDER or on which artifact a phase produces, the contract wins; the playbook owns the *craft* of executing its phase.

> **Agent-facing, machine-followable.** This is a contract an agent runs, not a wizard a human clicks through. Chat is the user interface; `ralphy` is the runtime. The machine-readable half of this doc is `cli/lib/contract.ts` (`CONTRACT_PHASES` + `evaluateContract()`), surfaced as `ralphy project status <id> --contract`. The phase list here and the constant there are kept in lockstep.

> **Issue:** #406. Sibling issues fulfil individual phases: content-mode selection (#412, landed), benchmark/style lock (#408), production plan (#407), eval (#411), repair (#409), unit lifecycle (#414/#069), content farm (#410).

## Why a contract exists

Low-quality projects come from agents improvising the workflow: weak brief capture, no benchmark lock, a skipped scenario score, bulk generation before the first approval, a final render with no eval. Every postmortem under `.ralphy/workspaces/<ws>/projects/<id>/postmortem/` that traced a cost overrun traced it to skipping one of the phases below. The contract gives every agent the same rails so the failure modes are structurally prevented, not re-learned per project.

## The contract at a glance

| # | Phase | Artifact | Required | Gate / checkpoint |
|---|---|---|---|---|
| 1 | Intake | `BRIEF.md` | yes | clarifying questions answered |
| 2 | Content-mode selection (#412) | — (agent-driven) | — | `classifyContentMode()` emitted; ask one Q if `ambiguous` |
| 3 | Format / template match | — (recorded in plan) | — | `ralphy template suggest --format <f>` |
| 4 | Memory recall (#112/#114) | — (agent-driven) | — | `ralphy memory recall` digest applied |
| 5 | Reference gate (AGENTS.md #3) | refs in `artifacts/refs/` | — | `ralphy ref check <id>` passes or `--no-ref-consent` logged |
| 6 | Research bootstrap (#416) | `artifacts/refs/research-facts.json` (or `research/report.md`) | optional | `chooseResearchDepth` → route to the existing surface; `none` writes nothing |
| 7 | Benchmark / style grounding (#408) | `STYLE_LOCK.md` | optional | register locked before prompts (per content-mode) |
| 8 | Production plan (#407) | `PRODUCTION_PLAN.md` | yes | **user "go" before any paid generation** |
| 9 | Preflight council (#415) | `council-preflight.json` | optional | `ralphy project council <id> --phase preflight` reviews the plan BEFORE paid gen |
| 10 | Scenario quality | `scenario.json` | yes¹ | `scoreScenario` refuse-not-warn |
| 11 | Prompt drafting | `prompts.json` | yes | `scoreImage` / `scoreVideo` on draft |
| 12 | Asset generation | `asset-manifest.json` + `artifacts/<kind>/` | yes | per-slot checkpoints; auto-version on regen |
| 13 | Render preflight + render | `render/final.mp4` | yes | `ralphy editor preflight <id>` → `ralphy render <id>` |
| 14 | Eval (#411) | `eval.json` (+ `eval-report.md`) | yes | `/evaluator`; **native-video gate is the ship gate** |
| 15 | Repair (#409) | `repair-plan.json` (optional) | — | fixer runs `ralphy project repair-plan <id>` (deterministic, zero model calls), gets approval, then auto-versioned re-rolls |
| 16 | Polish council (#415) | `council-polish.json` | optional | `ralphy project council <id> --phase polish` reviews the eval AFTER eval, BEFORE Unit |
| 17 | Unit formation (#069) | `units/<slug>/` + `unit.json` | optional | `ralphy unit create`; COPY-not-move, append-only |
| 18 | Postmortem + memory capture (#117) | `postmortem/` | optional | `/postmortem` → `ralphy memory distill` |

¹ `scenario.json` is **not** required for `image-pack` projects (posters, carousels, fb-creative packs, sticker packs) — they have no scenario. `evaluateContract()` relaxes the requirement when it detects the image-pack shape.

The phase ids in column 2 match `CONTRACT_PHASES[].id` in `cli/lib/contract.ts` exactly: `intake`, `content-mode`, `format-template-match`, `memory-recall`, `reference-gate`, `research`, `style-lock`, `production-plan`, `council-preflight`, `scenario`, `prompts`, `assets`, `render`, `eval`, `repair`, `council-polish`, `unit`, `postmortem`.

> **This contract IS the Unit production lifecycle (#414).** The canonical end-to-end lifecycle doc — phase-by-phase required artifacts, stop conditions, cheap-vs-native validation usage, and the resume model — is [`unit-lifecycle.md`](unit-lifecycle.md). It reads this contract as its backbone; producer / templater / evaluator / unit docs defer to that one vocabulary. The machine-readable resume model lives in `evaluateContract()` (alias `lifecycleStatus()`), surfaced as `ralphy project status <id> --contract` (alias `--lifecycle`).

## The phases in order

Each phase below names: **required artifact(s)**, **allowed skips** (and what consent a skip needs), **user checkpoints**, and **stop conditions**.

### 1 — Intake → `BRIEF.md`

- **Produces:** `BRIEF.md` — the captured brief: audience language, aspect/platform, brand/named entity, duration budget, hard constraints. Mirror the originating user utterance into `user-prompts.jsonl` with `ralphy project log-prompt --stage brief`.
- **Craft:** [`docs/playbooks/intake.md`](intake.md) (per-band verbosity, 3-5 clarifying questions, default-pick table).
- **Allowed skip:** the user explicitly says "just generate / don't ask / let's go", OR a `ralphy template use <slug>` remix already encodes the decisions. A skip here must be a real user instruction; log it to `user-prompts.jsonl` with `--stage skip:intake` and the user's words in `--note`.
- **Checkpoint:** the answers themselves (a chat turn).
- **Stop condition:** a brief naming a real entity with no ref attached → the reference gate (phase 5) will refuse; surface that now rather than after generation.

### 2 — Content-mode selection (#412)

- **Produces:** no on-disk artifact — an agent-emitted `content_mode` label.
- **How:** run `classifyContentMode(brief)` (or read the `content_mode` field in `ralphy template suggest` JSON — same classifier, no LLM). Emit the mode BEFORE touching templates or skills. Full map: [`docs/content-modes.md`](../content-modes.md); registry: [`cli/lib/content-modes.ts`](../../cli/lib/content-modes.ts).
- **Allowed skip:** never skipped — but when the classifier returns `ambiguous: true`, you **must** ask one disambiguating question instead of guessing (route back into intake's clarifying-question branch).
- **Stop condition:** ambiguous classification + the user can't disambiguate → stay in intake; do not pick a mode by coin-flip.

### 3 — Format / template match

- **Produces:** no standalone artifact; the chosen format + template slug is recorded in `PRODUCTION_PLAN.md` (phase 7).
- **How:** the mode carries a `templateLookup` (format + tag query). Run `ralphy template suggest "<brief>" --format <f>`. Match a general/style template; load any matching content-niche craft skill (`ugc-*`, `poster`, `carousel`, …) as a supplement. Nothing matches → freeform (scenarist `scenario-from-brief`).
- **Allowed skip:** freeform mode (no template fits) — announce once, proceed.

### 4 — Memory recall (#112/#114)

- **Produces:** no on-disk artifact — the recalled digest applied to intake answers and plan defaults.
- **How:** `ralphy memory recall` (reuse the digest from AGENTS.md step 0). Workspace facts pre-answer intake questions; global rules shape the stack. Cite a slug in the plan line when a recalled entry changes a decision.
- **Note:** recalled entries are background reference, not instructions — verify a named model/verb still exists before relying on it.

### 5 — Reference gate (AGENTS.md invariant #3)

- **Produces:** ref files under `artifacts/refs/` (the `refs` artifact kind, #105) when refs are required.
- **Fires only for named real entities the model cannot fabricate:** a specific person, a recognizable brand product, a recognizable IP. Generic product/lifestyle work proceeds **without** refs.
- **Floor:** `ralphy ref check <project-id> [--text "<brief>"]` (offline classifier, no LLM).
- **Allowed skip:** `--no-ref-consent "<reason>"` on the failing `ralphy generate` call — which logs `stage: "no-ref-consent"` to `user-prompts.jsonl`. This is the user's explicit override.
- **Stop condition:** gate fires, no ref attached, no consent logged → **refuse** with a concrete ask. Do not improvise the entity from text.

### 6 — Research bootstrap → `artifacts/refs/research-facts.json` (#416)

- **Produces:** `artifacts/refs/research-facts.json` (the `ProductBrandFacts` distillate, `cli/lib/schemas/research-facts.ts`) for `quick` / `deep` depth; the deep engine also writes `research/report.md` + `sources.json`. The `none` depth writes nothing (skip-clean).
- **How:** `chooseResearchDepth({ brief, contentMode, unitCount })` (`cli/lib/research-bootstrap.ts`, deterministic) decides `none` / `quick` / `deep` by composing the content-mode `defaultResearchDepth` baseline with trigger detection (product/brand/creator URL, low-detail niche, multi-Unit farm, performance goal) — MAX of the two. Then route the depth to the EXISTING surface (no new crawler): `quick` → site-grounding sub-agent (AGENTS.md #15) / a few `ralphy ref pull`; `deep` → `ralphy research run "<niche>"` + `ralphy research scrape-profile <handle>`. Set the plan's `benchmarkSource` to cite the distillate. Full discipline: [`research-bootstrap.md`](research-bootstrap.md).
- **Order:** BEFORE the style lock (phase 7) so the register and the plan ground in findings, not memory.
- **Allowed skip:** the bootstrap returned `none` (mode default none + nothing triggered) — nothing to research; plan directly from the brief.
- **Stop condition:** a `deep` decision with no resolvable niche / source → ask the user to narrow the niche before the deep scan burns calls.

### 7 — Benchmark / style grounding → `STYLE_LOCK.md` (#408)

- **Produces:** `STYLE_LOCK.md` — the frozen register: realism axis (still-photo / TV-commercial / CGI-specimen / X-ray / PS1-horror / …), palette, framing, lens/grade, any `@guideline:<slug>` rules folded in. Optional but **required when the content-mode's `guidelineOrStyleLock` is required**, or when the brief points at a benchmark video/site.
- **How:** for a benchmark video, `ralphy ref pull <url>` → `ralphy ref frames` / `ralphy ref analyze-video`, then read the frames to pin the register (never eyeball the thumbnail). For a brand URL, the site-grounding sub-agent (AGENTS.md invariant #15) writes `artifacts/refs/research.md` first.
- **Allowed skip:** no style/benchmark lock in scope (the mode marks it not-required and the brief names no benchmark). Announce the skip; no consent needed since it is in-scope.
- **Stop condition:** a mode requiring a style lock with no benchmark resolvable → ask the user for one before drafting prompts.

### 8 — Production plan → `PRODUCTION_PLAN.md` (#407)

- **Produces:** `PRODUCTION_PLAN.md` — vibe, format + template (+ craft overlay), beat structure, model stack, estimated cost + wall-clock, the first checkpoint. Drafted in chat first (intake step 2), then written to the project.
- **Checkpoint — HARD:** **wait for the user's "go" / "let's go" / equivalent before generating ANY paid asset.** This is the single most-cited postmortem lever (the appstore 70-min wasted background-poll). No "go" → no spend.
- **Allowed skip:** the user said "fire the whole batch / don't gate me" — honor it for THAT project, note the preference, still write the plan.
- **Stop condition:** the user rejects the approach → re-draft from the correction; don't dig in on the rejected plan. The lifecycle surfaces this as the `user-approval-needed` stop while the plan is written but no paid asset has run.

### 9 — Preflight council → `council-preflight.json` (#415)

- **Produces:** `council-preflight.json` + `council-preflight.md` — a `ship | revise | block` verdict, per-role scores, blocking issues, and `prioritizedActions`. Optional.
- **How:** for a high-stakes or expensive plan, convene the seven-role council on the plan BEFORE any paid generation: `ralphy project council <id> --phase preflight`. It fans one bounded `callLLM()` pass per role (strategist, niche-researcher, creative-director, art-director, editor, performance-marketer, qa-evaluator) over `production-plan.json` — NO media generation, NO browsing.
- **Order:** AFTER the production plan, BEFORE scenario / any paid generation.
- **Allowed skip:** a cheap / low-stakes plan — the council is advisory, not a hard gate. The user "go" (phase 8) is still the spend gate.
- **Stop condition:** a `block` verdict → resolve the blocking issues and fold the prioritized actions into the plan before spending.

### 10 — Scenario quality → `scenario.json`

- **Produces:** `scenario.json` — the locked scene-by-scene scenario.
- **Gate:** `ralphy project score <id>` / `scoreScenario` — **refuse, not warn** (AGENTS.md invariant #4). Two failures in a row → stop and report concrete options.
- **Allowed skip:** `image-pack` projects (no scenario by shape) — `evaluateContract()` relaxes the requirement for them. Freeform single-asset edits also skip.
- **Stop condition:** scenario fails the gate twice → do NOT proceed to prompts.

### 11 — Prompt drafting → `prompts.json`

- **Produces:** `prompts.json` (and per-slot prompt files under `prompts/` when using `--prompt-file`).
- **Gate:** draft-stage `scoreImage` / `scoreVideo` where applicable; fold any `@guideline:<slug>` rules into the prompt.
- **Stop condition:** **never run a paid `ralphy generate` before the plan (phase 8) is approved.** This phase drafts; phase 12 spends.

### 12 — Asset generation → `asset-manifest.json` + `artifacts/<kind>/`

- **Produces:** generated media under `artifacts/{images,videos,voiceover,music,sfx,captions}/`, tracked in `asset-manifest.json`.
- **Cadence:** one beat at a time with checkpoints (intake step 3). Location-master-plate first, then character masters, then scene anchors, then i2v, then VO+music, then captions. Batch 4-6 only after ≥2 solo approvals.
- **Append-only (AGENTS.md #14):** regen auto-versions (`.v2`, `.v3`); failed/rejected gens stay on disk. `--force-overwrite` only on explicit user ask.
- **Gate:** `scoreImage` / `scoreVideo` per generated asset — refuse-not-warn, two strikes → stop.
- **Stop condition:** a novel failure (not a known model drift/filter) → pause and ask before burning another paid call.

### 13 — Render preflight + render → `render/final.mp4`

- **Produces:** `render/final.mp4`.
- **How:** `ralphy editor preflight <id>` (aspect/fps/music-length divergence) → `ralphy render <id>`. The ONLY render path is HyperFrames `index.html` → `render/` (AGENTS.md invariant #2). Snapshot `index.html` with `ralphy hyperframes save-version <id>` before any non-trivial composition edit.
- **Stop condition:** preflight flags divergence → fix before render; do not render over a failed quality gate (#4).

### 14 — Eval → `eval.json` (+ `eval-report.md`) (#411)

- **Produces:** `eval.json` (machine contract for the fixer, incl. the `gate` block) + `eval-report.md` (human-readable) — via the `/evaluator` skill.
- **Cheap vs native:** keyframe / structure modes are **diagnostics** — `gate.shipReady` is hard-false on them. The **native-video** full-mp4 pass (or `deep-style` when a style lock / brief exists) is the ONLY gate that can mark a Unit polished/ship-ready. The default final gate (no `--mode`) is native.
- **Checkpoint:** surface `eval-report.md` to the user inline.
- **Stop condition:** a `fail` verdict → the `quality-gate-failed` stop fires; a render with no native gate yet → the `native-gate-required` stop fires. Don't declare done / ship / publish over either.

### 15 — Repair (#409)

- **Produces:** `repair-plan.json` + `REPAIR_PLAN.md` (optional) — the deterministic eval-to-repair ledger. The fixer agent (`.agents/skills/fixer/SKILL.md`) reads the eval output (deep-vision `what_to_redo` first, else `eval.json` `findings[]`), runs `ralphy project repair-plan <id>` to classify each finding by owner (art-director / scenarist / editor) and order it by severity, then re-rolls existing slots (auto-versioned).
- **Hard gate:** `ralphy project repair-plan` makes ZERO model calls — but **no paid regeneration runs until the user approves the plan** (every item is born `approvalState: pending`).
- **Allowed skip:** eval is clean / the user accepts the render as-is.
- **Loop discipline:** one retry on the same approach, then redesign the failing scene (intake step 4). Return to eval (phase 14) after a repair wave.

### 16 — Polish council → `council-polish.json` (#415)

- **Produces:** `council-polish.json` + `council-polish.md` — the seven-role review of the eval report. Optional.
- **How:** after eval and BEFORE Unit formation, convene the council on the eval report: `ralphy project council <id> --phase polish`. Same seven bounded roles, reasoning over `eval.json` (+ `eval-deep-vision.json` when present) — NO media, NO browsing. Its `prioritizedActions` already speak the #409 repair vocabulary (owner art-director / scenarist / editor + category + severity), so they flow straight into the repair loop via `councilActionsToWhatToRedo` → `buildRepairPlan` (the verb's JSON `verdict.prioritizedActions` is the structural input — no free-form parsing).
- **Order:** AFTER eval (phase 14) / repair (phase 15), BEFORE Unit formation (phase 17).
- **Allowed skip:** the single-agent eval was decisive — use the council when it feels thin on market-fit / pacing / CTA judgment.

### 17 — Unit formation → `units/<slug>/` (#069)

- **Produces:** `units/<slug>/` = COPIES of curated `artifacts/` files + `unit.json` (format + ordered media + provenance). Formed by `ralphy unit create <project> --slug <s> --format <f> --from "<glob>"`.
- **Gate — HARD:** a Unit may only be considered polished/publishable once the native-video final gate is ship-ready (`eval.json` → `gate.shipReady === true`) OR an explicit user-approved bypass is logged. The lifecycle's `polished` field and the `native-gate-required` stop enforce this (#411 + #414 Acceptance #3).
- **Append-only (AGENTS.md #14):** COPY-not-move; a new slug → a new dir; re-`create` on an existing slug → `units/<slug>.v2/`; `ralphy unit add` appends.
- **Allowed skip:** the user just wanted the render and isn't packaging a deliverable. Publishing onward is the `templater` / `dev-publish-template` path (#056) — out of this contract's scope.

### 18 — Postmortem + memory capture → `postmortem/` (#117)

- **Produces:** `postmortem/` (the `/postmortem` 7-file set) and durable memory entries via `ralphy memory distill` / `ralphy memory note`.
- **When:** proactively at session end after ≥1 user correction or ≥1 CLI gap worked around. Auto-capture (AGENTS.md invariant #18) is write-and-tell during the session; the deep distill is here.
- **Allowed skip:** a trivial one-shot with no corrections and nothing reusable.

## Bypass handling (mandatory)

**Every skip of a phase requires user intent and is logged to `user-prompts.jsonl`.** There is no silent skip. Concretely:

- The reference-gate skip is the canonical, tooled form: `ralphy generate ... --no-ref-consent "<reason>"` writes `stage: "no-ref-consent"`.
- For any other phase the user explicitly waives (e.g. "don't gate me, fire the batch" → skips the plan-approval checkpoint, or "just generate" → skips intake), log it with `ralphy project log-prompt <id> --stage "skip:<phase-id>" --text "<user's words>" --note "<reason>"`, using the phase id from `CONTRACT_PHASES` (`intake`, `production-plan`, `style-lock`, …).
- A skip the user did NOT ask for is a contract defect, the same defect class as skipping a playbook read. If you find yourself wanting to skip a required phase for your own convenience — don't.

## Checking where a project sits — the resume model (#414)

`ralphy project status <id> --contract` (alias `--lifecycle`) returns the machine-readable ledger. As of #414 it carries the **resume model** so an agent can pick a project up mid-flight without guessing the phase:

```json
{
  "project": "spring-2026-001",
  "kind": "video",
  "phases": [
    { "id": "intake", "label": "...", "artifact": "BRIEF.md", "required": true, "present": true, "satisfied": true, "rationale": "..." },
    { "id": "scenario", "artifact": "scenario.json", "required": true, "present": false, "satisfied": false, "...": "..." }
  ],
  "missingRequired": ["scenario.json", "prompts.json", "asset-manifest.json", "render/final.mp4", "eval.json"],
  "nextRecommendedAction": "Write the scenario (scenario.json) and pass scoreScenario before handing off to the art-director.",
  "complete": false,
  "currentPhase": "production-plan",
  "nextPhase": "scenario",
  "nextStep": "Write the scenario (scenario.json) and pass scoreScenario before handing off to the art-director.",
  "stopConditions": [
    { "id": "user-approval-needed", "phase": "production-plan", "severity": "block", "detail": "production plan is written but no paid asset has been generated. Wait for the user's explicit 'go' ..." }
  ],
  "polished": null
}
```

- `phases[]` — per-phase `{ satisfied, artifact, present, required, rationale }`. Agent-driven phases (`artifact: null`) report `satisfied: true` (their gate is the agent loop, not the disk).
- `missingRequired` — required artifacts still absent, in phase order.
- `nextRecommendedAction` — the first unsatisfied **required** phase's next step (kept for backward compatibility).
- `currentPhase` — the furthest satisfied phase (deepest trail point), or `null`.
- `nextPhase` / `nextStep` — the first unsatisfied artifact-bearing phase (the resume cursor) + a one-line instruction.
- `stopConditions[]` — blocking / advisory conditions derived from project state: `reference-required`, `quality-gate-failed`, `mode-unsupported`, `estimate-exceeds-target`, `user-approval-needed`, `native-gate-required`. Empty when nothing blocks.
- `polished` — `true` only when the render passed the **native-video final gate** (`eval.json` → `gate.shipReady === true`) or a logged user-approved bypass; `false` when a render exists but the native gate has not passed; `null` before any eval. A Unit is not polished/publishable while this is not `true` (#411 + #414 Acceptance #3).

Use this to self-check before claiming a project is done, to resume a project mid-flight after a context reset, and (in the content-farm loop #410) to drive the next action without re-reading the whole project tree. It is guidance, not a wizard — it never prompts the user.

## Cross-references

- [`docs/playbooks/unit-lifecycle.md`](unit-lifecycle.md) — the canonical end-to-end Unit production lifecycle (#414). This contract is its phase backbone.
- [`AGENTS.md`](../../AGENTS.md) — routing table + hard invariants (#2 ralphy-only, #3 reference gate, #4 gates refuse, #14 append-only, #15 site-grounding, #18 auto-memory). The contract executes those invariants in order.
- [`docs/playbooks/intake.md`](intake.md) — phases 1-8 craft (clarifying questions, plan, wait-for-go).
- [`docs/playbooks/producer.md`](producer.md) — the end-to-end wrapper that sequences the role phases + batch.
- [`docs/playbooks/research-bootstrap.md`](research-bootstrap.md) — phase 6 (the research-depth decision).
- [`docs/content-modes.md`](../content-modes.md) — phase 2 (the mode that drives the route).
- `cli/lib/contract.ts` — `CONTRACT_PHASES` + `evaluateContract()` / `lifecycleStatus()` (the machine-readable half).
