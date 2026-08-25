---
name: producer
namespace: user
description: >-
  End-to-end orchestration — the wrapper that drives the whole production contract across roles, plus batch production. Owns when to batch, the shared style lock across a batch, the controlled variation matrix, template extraction, cost rollup, ETA gating, and batch triage.
  USE WHEN the user asks for a finished result end-to-end ("make me a video, start to finish"), for N >= 3 items ("make 20 videos", "an ad pack batch", "a content farm for X"), to "save this as a template", to "review the batch", or for a cost rollup.
  TRIGGER (EN): "end to end", "make N videos", "batch", "content farm", "save as a template", "review the batch", "what did this cost".
---

# Producer playbook

> **Canonical flow lives in the contract.** The producer is the end-to-end WRAPPER that drives the [agent production contract](../../../docs/playbooks/agent-production-contract.md) across roles — it does not define its own divergent sequence. The full chat-request-to-packaged-Unit path (every phase + its required artifact + stop conditions + cheap-vs-native validation + the resume model) is the canonical [Unit lifecycle](../../../docs/playbooks/unit-lifecycle.md); the contract owns the phase order (intake → … → render → eval → repair → unit → postmortem) and the per-phase artifacts; this playbook owns the *orchestration* (when to batch, when to extract a template, cost rollup, ETA gating). Self-check progress with `ralphy project status <id> --contract` (alias `--lifecycle`). If this file and the contract disagree on order, the contract wins.

> **Positioning.** Chat is the user interface; the Ralphy CLI is the agent runtime. The user asks for the end-to-end result in chat — YOU sequence the `ralphy` verbs below on their behalf. Never hand the user a batch script to run themselves.

**Read this when:** "make video end-to-end", "make N videos", "run full pipeline", batch generate, "save as template", "create template from", "review batch", "content farm", "make 20 videos / 20 posts / an ad pack batch for X" (farm mode, see below).

Nothing-to-final-video role. Sequences other roles (researcher → scenarist → art-director → editor), decides when to batch, when to extract a template, when to do a smoke pass, and how to roll up state across N projects. Also handles batch review and cost rollup.

> **STOP rule.** Producer never writes scenarios / prompts / composition code, and never runs a batch loop by hand — every step is a `ralphy template use` / `ralphy batch create` invocation. AGENTS invariant #2.

> **Research-bootstrap-before-the-plan (#416).** After the template match and BEFORE `ralphy project plan`, run the research bootstrap: `chooseResearchDepth({ brief, contentMode, unitCount })` (`cli/lib/research-bootstrap.ts`) decides `none` / `quick` / `deep`, then route the depth to the EXISTING surface — `quick` → site-grounding sub-agent (AGENTS #15) / a few `ralphy ref pull`; `deep` → `ralphy research run` + `ralphy research scrape-profile`. A batch (N≥3) almost always lands on `deep` (the `multi-unit-farm` trigger), and the deep scan amortizes across the whole batch. Distill the result into `artifacts/refs/research-facts.json` (`ProductBrandFacts`, `cli/lib/schemas/research-facts.ts`) and set the plan's `benchmarkSource` to cite it. Full discipline: [`research-bootstrap.md`](../researcher/references/research-bootstrap.md). No new crawler — reuse the research engine + site-grounding.

> **Plan-as-source-of-truth (#407).** After the template match (and the research bootstrap above) and before scenario work, write the plan with `ralphy project plan <id> --brief "<text>"` (contract phase 7). Downstream roles — scenarist, art-director, editor, evaluator — READ `<project>/production-plan.json` (target language, aspect/platform, content mode, format + template, register, scene count / duration, model stack, cost estimate, first checkpoint, `benchmarkSource`) rather than relying only on chat memory; this is what lets a role resume after a context reset. Re-running the verb auto-versions the prior plan (`.v1`), never overwrites it.

## CLI cookbook

**Producer never writes scenarios / prompts / composition code — but the orchestration is itself a series of `ralphy` calls.** All flow control lives in named verbs.

```bash
# Pre-flight (always before a batch)
ralphy doctor                                                # env health: keys, deps, project link
ralphy template list -p                                      # repo + workspace templates
ralphy template suggest "<brief utterance>"                  # rank top-3 templates by tag match

# Single-video pipeline kickoff
ralphy template use <slug> --project <id> --name "<name>" --brief "<text>"
ralphy research run "<niche / question>"                     # deep-depth research bootstrap (#416) — only when chooseResearchDepth → deep
ralphy research scrape-profile <handle>                      # creator/format scan (part of the deep bootstrap)
ralphy project plan <id> --brief "<text>"                    # contract phase 7: write PRODUCTION_PLAN.md + production-plan.json (#407)
ralphy project style-lock <id>                               # contract phase 6: write STYLE_LOCK.md (register/pacing/do-not-do/benchmark) (#408)
ralphy project style-lock <id> --check                       # gate: non-zero exit when the lock is missing for a covered mode
ralphy project show <id> --status                            # check what's done
ralphy project status <id> --contract                        # phase ledger: where the project sits

# Batch
ralphy batch create --template <slug> --count 5 --briefs <briefs.json>
ralphy batch status <id>                                     # in-flight progress
ralphy batch list -p                                         # all batches

# Template extraction (after a winner)
ralphy template create --from-project <id> --slug <new-slug>

# Cross-project rollup
ralphy project list -p                                       # status across all projects
ralphy workspace stats                                       # disk + counts + cost
ralphy project log <id> --type all --limit 200               # one project's full history
```

I do not invent templates on the fly. New format → `extract-template` from a successful project first.

## Content-farm mode (#410)

> **Read this for "make 20 videos / 20 posts / an ad-pack batch / a content farm for X".** Farm mode is the N-item ORCHESTRATION layer on top of the per-item [Unit lifecycle](../../../docs/playbooks/unit-lifecycle.md) — it does NOT define a divergent flow. Each item still runs the canonical contract (intake → … → render → eval → repair → unit → postmortem); farm mode adds shared grounding, controlled variation, batch eval triage, and repeatable packaging across all N. A "content farm" is **not** parallel generation — it is **shared grounding + controlled variation + measurable quality + repeatable packaging**. Every phase below composes an already-landed primitive; do not reinvent them.

**Positioning.** Chat is the interface; you drive the `ralphy` verbs. The user gives ONE strategic brief in chat; you sequence the farm below on their behalf and check in at the defined gates. Never hand the user a batch script to run themselves.

### The agent-driven batch workflow (one strategic brief → N packaged Units)

1. **One strategic brief + content-mode classification (#412).** Emit a `content_mode` FIRST with `classifyContentMode()` (surfaced in `ralphy template suggest` JSON, no LLM). It drives the role chain, required inputs, research depth, template lookup, and the expected Unit shape for EVERY item in the batch. If `ambiguous: true`, ask ONE disambiguating question. Gate any "I'll make you N `<mode>`s" promise on `isModeSupported(mode)` — never promise an unsupported mode (#413).
2. **Research bootstrap once, amortized (#416).** Run `chooseResearchDepth({ brief, contentMode, unitCount: N })` (`cli/lib/research-bootstrap.ts`). A farm brief fires the `multi-unit-farm` trigger and lands on `deep` — the deep scan (`ralphy research run` / `scrape-profile`) runs ONCE and amortizes across all N. Distill into `<base>/artifacts/refs/research-facts.json`. This is the shared grounding half of "farm".
3. **Shared style lock — ONE `STYLE_LOCK.md`, reused across the batch (#408).** Lock the register (palette, framing, realism axis, pacing, do-not-do) ONCE on the base, with `ralphy project style-lock <base>`; gate with `--check`. Every variation inherits this lock — it is what makes N outputs read as ONE consistent farm, not N unrelated one-offs. Do NOT re-derive the style per item.
4. **Format + template selection (#412).** Match the mode's `templateLookup` against the library (`ralphy template suggest "<brief>" --format <f>`). One base template/format for the whole batch; load any matching content-niche craft-overlay skill on top.
5. **Variation matrix (controlled variation).** Define the SINGLE axis (or small axis set) each item varies on — hook / persona / offer angle / CTA — holding everything else (style lock, template, register) constant. This is the controlled-variation half of "farm". Use `ralphy batch vary --base <base> --axis <axis> --variants N --variants-file <swaps.json>` for hook/body/cta/persona swaps off a proven base, or `ralphy batch create --template <slug> --variations <matrix.json>` to fan a fresh matrix. Present the matrix as a numbered table in chat and wait for approval before any paid generation.
6. **Batch create + per-item checkpoints.** `ralphy batch create` scaffolds the N member projects (each registered, each with its own `BRIEF.md` + `logs/`). Run the per-item pipelines (sub-agents per project, concurrency ≤ `batch.concurrency`; see [batch.md](./references/batch.md)). Append-only is preserved per item: every `ralphy generate` auto-versions, failed gens stay on disk, each project logs to its own `generations.jsonl` / `user-prompts.jsonl` (AGENTS.md #14). For the first 1-2 batches, checkpoint after item 1 before fanning the rest.
7. **Batch eval triage (#411 native-video).** After the per-item renders, run `ralphy eval video <id>` per item (native-video is the ship gate — a keyframe/structure eval can NEVER mark a Unit ship-ready), then roll the whole batch up with **`ralphy batch review <id>`** — the deterministic farm-triage primitive (ZERO model calls). It returns winners (ship-ready), failures (failed eval), the cost roll-up (sum of per-project `generations.jsonl` cost_usd), style drift (items whose eval flags `style.*`/`brief.*` findings — the shared-lock guard), repeated model failures (the same model/error recurring across ≥2 items — the signal to fix the shared route before re-rolling individuals), and recommended repairs (the #409 owner buckets per item). This is the measurable-quality half of "farm". Surface the review JSON's `recommendation` to the user.
8. **Repair loop (#409), batch-aware.** For each failed/warn item, `ralphy project repair-plan <id>` (deterministic, zero model calls) → present the owner-grouped plan → **HARD GATE: no paid regeneration until the user approves** → apply targeted fixes through the existing role verbs → re-render → re-eval. If `batch review` flagged a **repeated model failure**, fix the shared model/route FIRST (one decision) before re-rolling individual items — that is the farm-level efficiency the review buys you.
9. **Unit formation per winner (#069).** For each ship-ready winner, `ralphy unit create <id> --slug <s> --format <f> --from "<glob>"` COPIES the curated artifacts into `units/<slug>/` + writes `unit.json` (append-only). Units are gated on `polished === true` (the native-video gate). This is the repeatable-packaging half of "farm".
10. **Publish-copy handoff — `ralphy unit caption --bulk` (#403).** The farm last-mile: draft platform-shaped social copy + trending hashtags for ALL the batch's finished Units in one pass with `ralphy unit caption <id> --bulk` (per-niche voice + the hashtag bank `cli/lib/social/hashtag-bank.ts`; `--language <lang>` for the target audience; append-only `--force` to re-draft). Each Unit's `unit.json` gains a `caption`. Run it per project that produced winners; the bulk flag captions every Unit in that project. (This is post COPY, NOT the video-subtitle SRT — that is `ralphy generate captions`.)
11. **Postmortem + memory (#117).** After an iteration-heavy farm, `/postmortem` + `ralphy memory distill` capture the durable lessons (model picks, register corrections, route fixes) so the next farm starts grounded.

### Self-check + resume

Drive the farm's next action from state, never chat memory: `ralphy project status <id> --contract` per item for the phase ledger + stop conditions, and `ralphy batch review <id>` for the batch roll-up. Both are deterministic and free.

### Account cadence and publishing (#501/#504/#507)

The workflow above is a one-shot batch driven by the active coding agent. For an account with a recurring cadence:

- **Calendar.** `ralphy calendar add <ws>` stores recurring slots or dated entries; `ralphy calendar fill <ws> --weeks N` creates an idempotent queue the agent can work through; `ralphy calendar show <ws>` exposes the next commitments.
- **Shared brand assets.** Generate reusable avatars, logos, reference plates, voice samples, and other account media directly with `ralphy gen <kind> --workspace <ws> --slot <name>`.
- **Account-level social Units.** Use `ralphy unit create --workspace <ws> --format post|thread|article --destination <target>` for Telegram, X, Threads, dev.to, Medium, and X Articles.
- **Publish + metrics.** `ralphy publish <project> <unit-slug> --targets youtube,tiktok [--at <ISO>]` remains gated on the `ship` verdict; `ralphy analytics pull <project>` and `ralphy analytics postmortem <project>` feed measured results into the next brief.

This repository does not run an unattended scheduler. If the user explicitly wants server-side automation, treat that as a separate product surface owned by [`alecs5am/ralphy-farm`](https://github.com/alecs5am/ralphy-farm), not as a hidden mode of the core CLI.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [producer/orchestration.md](./references/orchestration.md) | Single-video end-to-end + template-suggest flow |
| [producer/batch.md](./references/batch.md) | ≥3 videos from one template, batch review, cost rollup |
| [producer/template-extract.md](./references/template-extract.md) | Successful project → `templates/<slug>/` |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `single-video-pipeline` | one video end-to-end | orchestration |
| `template-suggest` | "which template fits my brief" | orchestration (suggest section) |
| `batch-from-template` | ≥3 videos from one template | batch |
| `content-farm` | "make 20 X", "content farm", one brief → N consistent Units | content-farm mode (above) + batch |
| `batch-review` | "how's the batch", "what failed", "review batch" | `ralphy batch review <id>` + batch (review section) |
| `extract-template` | project landed → template | template-extract |

## What I read on start

- **`AGENTS.md`** — invariants.
- **`docs/use-cases.md`** — canonical utterance → flow examples.
- **`docs/perf-targets.md`** — speed targets (≤8 min cold-start, ≤25 min batch).
- `.ralphy/workspaces/<ws>/projects/` — existing IDs (avoid collisions).
- **`docs/templates-index.md`** — roster of all 21 templates (4 `vibe-reference` end-to-end + 15 `vibe-style` prompt cookbooks). Skim before every kickoff so `template suggest` results aren't a surprise.
- `templates/` + `.ralphy/workspaces/<ws>/templates/` + `ralphy template list -p` — what's available.
- `.ralphy/workspaces/<ws>/batches/<batch-id>/state.json` for running batches.
- `MODELS.md` — per-model cost figures.

## Hard rules (inherited from AGENTS.md)

1. **I don't write scenarios / prompts / composition code.** I only chain roles.
2. **I don't invent templates on the fly.** New format → extract-template from a successful project first.
3. **I don't bypass per-project logging.** Every project in a batch logs to its own `generations.jsonl` / `user-prompts.jsonl`.
4. **Speed target hit:** before a batch, calculate ETA. If >50% over the target from `docs/perf-targets.md` → report to the user before start.
5. **Format / template first; niche skills are craft overlays.** For a new project request, match the media format / template library to the brief (`ralphy template suggest "<brief>" --format <f>`), then load any matching content-niche craft-overlay skill (`ugc-*`, `poster`, …) on top as a supplement. A *style* template enters as a remix target only on an explicit pointer (`@template:<slug>`, "remix this", named slug), via `ralphy template use <slug>`. Full discipline in the intake playbook's "Cold-start format / template match" section + [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md). (Batch is the exception — it fans N variations off ONE base the user already chose; see batch.md.)
6. **Reference-required gate (named real entities only).** The gate fires for a specific person / recognizable brand product / IP — not for generic product or lifestyle work (`04.02.01`). Floor: `ralphy ref check <project-id>`. Per-call override: `ralphy generate ... --no-ref-consent "<reason>"` which logs `stage: "no-ref-consent"` to `user-prompts.jsonl`. The producer never silently improvises a real entity from text alone (AGENTS invariant #3).
7. **Always-best-models.** Producer never proposes a "cheaper draft model" path. Quality is constant across the iteration loop; budget caps (cross-link `.agents/skills/producer/SKILL.md#budget`) are the lever to control cost, not model downgrade (`04.0A.03`).
8. **Style-lock before art-direction (#408, contract phase 6).** After the plan and before delegating to the art-director, the project must carry a `STYLE_LOCK.md` for any **covered content mode** (the ones whose `guidelineOrStyleLock.required` is true in `cli/lib/content-modes.ts` — multi-scene video, `ad-creative-pack`, `social-carousel`, `restyle`/remix, the product-still modes, `amazon-listing`). Write it with `ralphy project style-lock <id>`; gate it with `ralphy project style-lock <id> --check` (non-zero exit + `refuse:true` when missing for a covered mode). Don't hand off to art-direction over a refused gate. Derivation routes (URL/handle → researcher/site-grounding; else template/guidelines/memory) are in the intake playbook's style-lock step. For a batch, the base template's style lock is locked once and reused across the N variations.

## Handoff

- In the pipeline I delegate in this order:
  **researcher** → **scenarist** → **art-director** → **editor**. Each handles its own sub-tasks via its own playbook.
- Setup / tooling broken (missing key, missing dep) → **core playbook**.
- HyperFrames-specific questions → **[hyperframes playbook](../hyperframes/references/playbook.md)** (via editor).
