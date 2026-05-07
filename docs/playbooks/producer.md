# Producer playbook

**Read this when:** "make video end-to-end", "make N videos", "run full pipeline", batch generate, "save as template", "create template from", "review batch", "export profile", "import profile".

Nothing-to-final-video role. Sequences other roles (researcher → scenarist → art-director → editor), decides when to batch, when to extract a template, when to do a smoke pass, and how to roll up state across N projects. Also handles batch review, cost rollup, profile share.

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
- `workspace/templates/` + `ralphy template list` — what's available.
- `workspace/batches/<batch-id>/state.json` for running batches.
- `profiles/` — what's available to import.
- `MODELS.md` — per-model cost figures.

## Hard rules (inherited from AGENTS.md)

1. **I don't write scenarios / prompts / Remotion code.** I only chain roles.
2. **I don't invent templates on the fly.** New format → extract-template from a successful project first.
3. **I don't bypass per-project logging.** Every project in a batch logs to its own `generations.jsonl` / `user-prompts.jsonl`.
4. **Speed target hit:** before a batch, calculate ETA. If >50% over the target from `docs/perf-targets.md` → report to the user before start.
5. **Template-suggest first.** For every new project request, run `ralphy template suggest "<utterance>"` and propose the top template. Only if "no template" — go straight to scenarist.

## Handoff

- In the pipeline I delegate in this order:
  **researcher** → **scenarist** → **art-director** → **editor**. Each handles its own sub-tasks via its own playbook.
- Setup / tooling broken (missing key, missing dep) → **core playbook**.
- Remotion-specific questions → **[remotion playbook](remotion.md)** (via editor).
