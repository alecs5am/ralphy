# Producer playbook

> **Canonical flow lives in the contract.** The producer is the end-to-end WRAPPER that drives the [agent production contract](agent-production-contract.md) across roles — it does not define its own divergent sequence. The contract owns the phase order (intake → … → render → eval → repair → unit → postmortem) and the per-phase artifacts; this playbook owns the *orchestration* (when to batch, when to extract a template, cost rollup, ETA gating). Self-check progress with `ralphy project status <id> --contract`. If this file and the contract disagree on order, the contract wins.

> **Positioning.** Chat is the user interface; the Ralphy CLI is the agent runtime. The user asks for the end-to-end result in chat — YOU sequence the `ralphy` verbs below on their behalf. Never hand the user a batch script to run themselves.

**Read this when:** "make video end-to-end", "make N videos", "run full pipeline", batch generate, "save as template", "create template from", "review batch".

Nothing-to-final-video role. Sequences other roles (researcher → scenarist → art-director → editor), decides when to batch, when to extract a template, when to do a smoke pass, and how to roll up state across N projects. Also handles batch review and cost rollup.

> **STOP rule.** Producer never writes scenarios / prompts / composition code, and never runs a batch loop by hand — every step is a `ralphy template use` / `ralphy batch create` invocation. AGENTS invariant #2.

> **Research-bootstrap-before-the-plan (#416).** After the template match and BEFORE `ralphy project plan`, run the research bootstrap: `chooseResearchDepth({ brief, contentMode, unitCount })` (`cli/lib/research-bootstrap.ts`) decides `none` / `quick` / `deep`, then route the depth to the EXISTING surface — `quick` → site-grounding sub-agent (AGENTS #15) / a few `ralphy ref pull`; `deep` → `ralphy research run` + `ralphy research scrape-profile`. A batch (N≥3) almost always lands on `deep` (the `multi-unit-farm` trigger), and the deep scan amortizes across the whole batch. Distill the result into `artifacts/refs/research-facts.json` (`ProductBrandFacts`, `cli/lib/schemas/research-facts.ts`) and set the plan's `benchmarkSource` to cite it. Full discipline: [`research-bootstrap.md`](research-bootstrap.md). No new crawler — reuse the research engine + site-grounding.

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

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [producer/orchestration.md](producer/orchestration.md) | Single-video end-to-end + template-suggest flow |
| [producer/batch.md](producer/batch.md) | ≥3 videos from one template, batch review, cost rollup |
| [producer/template-extract.md](producer/template-extract.md) | Successful project → `templates/<slug>/` |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `single-video-pipeline` | one video end-to-end | orchestration |
| `template-suggest` | "which template fits my brief" | orchestration (suggest section) |
| `batch-from-template` | ≥3 videos from one template | batch |
| `batch-review` | "how's the batch", "what failed" | batch (review section) |
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
5. **Format / template first; niche skills are craft overlays.** For a new project request, match the media format / template library to the brief (`ralphy template suggest "<brief>" --format <f>`), then load any matching content-niche craft-overlay skill (`ugc-*`, `poster`, …) on top as a supplement. A *style* template enters as a remix target only on an explicit pointer (`@template:<slug>`, "remix this", named slug), via `ralphy template use <slug>`. Full discipline in the intake playbook's "Cold-start format / template match" section + [`docs/skills-vs-templates.md`](../skills-vs-templates.md). (Batch is the exception — it fans N variations off ONE base the user already chose; see batch.md.)
6. **Reference-required gate (named real entities only).** The gate fires for a specific person / recognizable brand product / IP — not for generic product or lifestyle work (`04.02.01`). Floor: `ralphy ref check <project-id>`. Per-call override: `ralphy generate ... --no-ref-consent "<reason>"` which logs `stage: "no-ref-consent"` to `user-prompts.jsonl`. The producer never silently improvises a real entity from text alone (AGENTS invariant #3).
7. **Always-best-models.** Producer never proposes a "cheaper draft model" path. Quality is constant across the iteration loop; budget caps (cross-link `docs/playbooks/producer.md#budget`) are the lever to control cost, not model downgrade (`04.0A.03`).
8. **Style-lock before art-direction (#408, contract phase 6).** After the plan and before delegating to the art-director, the project must carry a `STYLE_LOCK.md` for any **covered content mode** (the ones whose `guidelineOrStyleLock.required` is true in `cli/lib/content-modes.ts` — multi-scene video, `ad-creative-pack`, `social-carousel`, `restyle`/remix, the product-still modes, `amazon-listing`). Write it with `ralphy project style-lock <id>`; gate it with `ralphy project style-lock <id> --check` (non-zero exit + `refuse:true` when missing for a covered mode). Don't hand off to art-direction over a refused gate. Derivation routes (URL/handle → researcher/site-grounding; else template/guidelines/memory) are in the intake playbook's style-lock step. For a batch, the base template's style lock is locked once and reused across the N variations.

## Handoff

- In the pipeline I delegate in this order:
  **researcher** → **scenarist** → **art-director** → **editor**. Each handles its own sub-tasks via its own playbook.
- Setup / tooling broken (missing key, missing dep) → **core playbook**.
- HyperFrames-specific questions → **[hyperframes playbook](hyperframes.md)** (via editor).
