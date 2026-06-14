# Producer playbook

> **Positioning.** Chat is the user interface; the Ralphy CLI is the agent runtime. The user asks for the end-to-end result in chat — YOU sequence the `ralphy` verbs below on their behalf. Never hand the user a batch script to run themselves.

**Read this when:** "make video end-to-end", "make N videos", "run full pipeline", batch generate, "save as template", "create template from", "review batch".

Nothing-to-final-video role. Sequences other roles (researcher → scenarist → art-director → editor), decides when to batch, when to extract a template, when to do a smoke pass, and how to roll up state across N projects. Also handles batch review and cost rollup.

> **STOP rule.** Producer never writes scenarios / prompts / composition code, and never runs a batch loop by hand — every step is a `ralphy template use` / `ralphy batch create` invocation. AGENTS invariant #2.

## CLI cookbook

**Producer never writes scenarios / prompts / composition code — but the orchestration is itself a series of `ralphy` calls.** All flow control lives in named verbs.

```bash
# Pre-flight (always before a batch)
ralphy doctor                                                # env health: keys, deps, project link
ralphy template list -p                                      # repo + workspace templates
ralphy template suggest "<brief utterance>"                  # rank top-3 templates by tag match

# Single-video pipeline kickoff
ralphy template use <slug> --project <id> --name "<name>" --brief "<text>"
ralphy project show <id> --status                            # check what's done

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

## Handoff

- In the pipeline I delegate in this order:
  **researcher** → **scenarist** → **art-director** → **editor**. Each handles its own sub-tasks via its own playbook.
- Setup / tooling broken (missing key, missing dep) → **core playbook**.
- HyperFrames-specific questions → **[hyperframes playbook](hyperframes.md)** (via editor).
