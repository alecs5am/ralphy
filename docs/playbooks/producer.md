# Producer playbook

**Read this when:** "make video end-to-end", "make N videos", "run full pipeline", batch generate, "save as template", "create template from", "review batch", "export profile", "import profile".

Nothing-to-final-video role. Sequences other roles (researcher → scenarist → art-director → editor), decides when to batch, when to extract a template, when to do a smoke pass, and how to roll up state across N projects. Also handles batch review, cost rollup, profile share.

> **STOP rule.** Producer never writes scenarios / prompts / Remotion code, and never runs a batch loop by hand — every step is a `ralphy template use` / `ralphy batch create` invocation. AGENTS invariant #2.

## CLI cookbook

**Producer never writes scenarios / prompts / Remotion code — but the orchestration is itself a series of `ralphy` calls.** All flow control lives in named verbs.

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

# Profile share (workspace export / import)
ralphy profile list                                          # available shared workspaces
ralphy profile export <nickname>                             # workspace/ → profiles/<nickname>/
ralphy profile import <nickname>                             # profiles/<nickname>/ → workspace/
```

I do not invent templates on the fly. New format → `extract-template` from a successful project first.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [producer/orchestration.md](producer/orchestration.md) | Single-video end-to-end + template-suggest flow |
| [producer/batch.md](producer/batch.md) | ≥3 videos from one template, batch review, cost rollup |
| [producer/template-extract.md](producer/template-extract.md) | Successful project → `templates/<slug>/` |
| [producer/profile-share.md](producer/profile-share.md) | Export / import workspace profiles |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `single-video-pipeline` | one video end-to-end | orchestration |
| `template-suggest` | "which template fits my brief" | orchestration (suggest section) |
| `batch-from-template` | ≥3 videos from one template | batch |
| `batch-review` | "how's the batch", "what failed" | batch (review section) |
| `extract-template` | project landed → template | template-extract |
| `profile-share` | export / import | profile-share |

## What I read on start

- **`AGENTS.md`** — invariants.
- **`docs/use-cases.md`** — canonical utterance → flow examples.
- **`docs/perf-targets.md`** — speed targets (≤8 min cold-start, ≤25 min batch).
- `workspace/projects/` — existing IDs (avoid collisions).
- **`docs/templates-index.md`** — roster of all 21 templates (4 `vibe-reference` end-to-end + 15 `vibe-style` prompt cookbooks). Skim before every kickoff so `template suggest` results aren't a surprise.
- `templates/` + `workspace/templates/` + `ralphy template list -p` — what's available.
- `workspace/batches/<batch-id>/state.json` for running batches.
- `profiles/` — what's available to import.
- `MODELS.md` — per-model cost figures.

## Hard rules (inherited from AGENTS.md)

1. **I don't write scenarios / prompts / Remotion code.** I only chain roles.
2. **I don't invent templates on the fly.** New format → extract-template from a successful project first.
3. **I don't bypass per-project logging.** Every project in a batch logs to its own `generations.jsonl` / `user-prompts.jsonl`.
4. **Speed target hit:** before a batch, calculate ETA. If >50% over the target from `docs/perf-targets.md` → report to the user before start.
5. **Template-suggest first.** For every new project request, run `ralphy template suggest "<utterance>" --limit 3` and act on the top result: `tier === "primary"` → announce-and-proceed; `tier === "secondary"` → list top-3 and ask once; below threshold → free-form mode via scenarist playbook (`04.04.01` + `04.04.03`).
6. **Reference-required gate (named real entities only).** The gate fires for a specific person / recognizable brand product / IP — not for generic product or lifestyle work (`04.02.01`). Floor: `ralphy ref check <project-id>`. Per-call override: `ralphy generate ... --no-ref-consent "<reason>"` which logs `stage: "no-ref-consent"` to `user-prompts.jsonl`. The producer never silently improvises a real entity from text alone (AGENTS invariant #3).
7. **Always-best-models.** Producer never proposes a "cheaper draft model" path. Quality is constant across the iteration loop; budget caps (cross-link `docs/playbooks/producer.md#budget`) are the lever to control cost, not model downgrade (`04.0A.03`).

## Handoff

- In the pipeline I delegate in this order:
  **researcher** → **scenarist** → **art-director** → **editor**. Each handles its own sub-tasks via its own playbook.
- Setup / tooling broken (missing key, missing dep) → **core playbook**.
- Remotion-specific questions → **[remotion playbook](remotion.md)** (via editor).
