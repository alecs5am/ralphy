---
name: universe-studio
namespace: user
description: >-
  Studio mode for a tagged workspace — the one-tag, four-approvals orchestrator (#474). Given an idea and an active workspace (`ralphy workspace use <ws>`), it runs production end-to-end as FOUR stages, each auto-assembled and auto-repaired against that workspace's own eval rubric before you see it: (1) location/cast → phase `style-lock`; (2) scenario → phase `scenario`; (3) scene anchors → phase `assets`; (4) final montage → phase `eval`. Each stage: assemble → `ralphy workspace eval <id>` → read the per-criterion scorecard → the #473 bounded repair loop (FREE editor fixes auto-loop; PAID regeneration STOPS for your approval) → present ONLY when the stage's criteria clear → wait for your stage approval before advancing. You make four decisions; everything else repairs itself against the universe's hard bar.
  GENERIC: parameterized by the ACTIVE workspace — works for ANY workspace with an `evaluators.json` + `stageGates`. It SEQUENCES the per-role playbooks (scenarist / art-director / editor) under the eval gates; it does NOT replace them.
  USE WHEN the user says "studio mode", "run my universe end-to-end", "make a <universe> video with the gates", "I'll make four approvals", "auto-assemble and auto-repair against my evals", "drive the staged studio for <workspace>", or tags a workspace and drops an idea expecting the staged-gate flow.
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# universe-studio — one tag, four approvals

The user's ideal UX: come with an idea, tag a workspace, make FOUR approval decisions while everything else auto-assembles and auto-repairs against the universe's own eval rubric. You are the orchestrator that delivers that. **Your input is an idea + an active workspace; your output is a rendered, eval-cleared deliverable produced through four user-approved stages.**

This skill is a **sequencer, not a craft skill.** It does not know how to write a scenario, prompt an image, or cut a video — the per-role playbooks own that. It owns the ORDER, the per-stage eval gate, the bounded repair loop, and the four user checkpoints. At each stage you delegate the actual work to the matching playbook, then gate the result.

## ALSO FIRE

- When a workspace is already active (`ralphy workspace use <ws>` was run earlier this session) and the user drops an idea expecting the staged flow.
- After `ralphy workspace eval` lands a clearing scorecard for one stage and the user says "good, next stage" / "keep going" (any language — match their chat language, English on disk).
- When the user explicitly opts into batch repair ("just fix it, don't ask me each stage") — you still announce paid spend before it runs, but the per-stage loop may apply paid items.

## DO NOT FIRE

- For a workspace WITHOUT an `evaluators.json` + `stageGates` rubric — there are no gates to drive. Route to the normal intake / producer flow instead, and (if it fits the user's intent) suggest authoring a workspace evaluator config first.
- For a single isolated stage ("just rewrite scene 3", "regen this one keyframe") — that is the scenarist / art-director playbook directly, not the four-stage orchestrator.
- For a quick one-off render with no universe gating — that is intake → producer.
- As a replacement for `/evaluator` or `/fixer` on an arbitrary mp4 — those are the standalone eval + repair skills. This skill only drives the per-stage workspace-eval gates inside the four-stage flow.

## HARD INVARIANTS

These are inherited from `AGENTS.md`; they are load-bearing here because the whole point is unattended auto-repair between checkpoints.

1. **Wait-for-go before paid generation (the paid gate).** The #473 loop auto-applies only FREE editor fixes (`costEstimate === 0`). The moment a stage needs a PAID regeneration (`costEstimate > 0` — an art-director re-roll, any `ralphy generate …`), the loop STOPS and surfaces `pendingPaidActions`. You present them and wait for explicit user approval before spending. No paid call between checkpoints without a prior "batch repair, don't ask me" opt-in. This mirrors `AGENTS.md` invariant #1 and `/fixer`'s hard gate.
2. **`ralphy` is the only entry-point.** Every assemble / eval / repair / render step routes through a `ralphy` verb. No raw `ffmpeg` / `curl` / `bunx tsx`. If a stage needs a verb that doesn't exist, propose adding it and stop (`AGENTS.md` #2).
3. **Append-only.** Re-assembles and repairs auto-version (`.v2`); never `--force-overwrite` without the user asking. Each stage's prior `workspace-eval.json` is archived to `.vN`; the old artifacts all stay on disk (`AGENTS.md` #14).
4. **Read `MODELS.md` before any model call** (`AGENTS.md` #6). Claude's training is stale.
5. **Generic — no universe literals.** Everything (which stage owns which criteria, the gate severity, the benchmarks) flows from the ACTIVE workspace's rubric. Never bake one universe's facts into the flow.

## Where the framework lives

You are the agent layer on top of the framework that already landed:

- **#468** — the workspace evaluator config (`evaluators.json` + `stageGates`) per workspace.
- **#469** — `ralphy workspace eval <project>` → writes `workspace-eval.json` + `workspace-eval-report.md` (append-only). The per-criterion scorecard you read at each stage.
- **#470** — the six builtin criteria: `material-density`, `edit-correctness`, `insta-metric-fit` (deterministic), `scenario-fidelity`, `character-design-cohesion`, `location-consistency` (vision).
- **#472** — the workspace `stageGates` map stage → contract phase → owned criteria, surfaced as `stage-gate-unmet` stop conditions by `ralphy project status <id> --contract`.
- **#473** — `runStageRepairLoop` (`cli/lib/eval/stage-loop.ts`): the bounded per-stage assemble → eval → repair → re-eval loop with the free=auto / paid=stop discipline.

The stage→phase→criteria map below is the DEFAULT the rubric ships with. **Always read the active workspace's actual `stageGates` — a universe can wire its own gates.** Do not hardcode the table.

## The four stages

| # | Stage | Contract phase | Gate criteria (default — read the rubric) | Owning playbook |
|---|---|---|---|---|
| 1 | **location / cast** | `style-lock` | `character-design-cohesion` + `location-consistency` (pre-screen of candidates) | art-director (+ researcher / reference gate for named real entities) |
| 2 | **scenario** | `scenario` | `scenario-fidelity` | scenarist |
| 3 | **scene anchors** | `assets` | `character-design-cohesion` + `location-consistency` | art-director |
| 4 | **final montage** | `eval` | `material-density` + `edit-correctness` + `insta-metric-fit` | editor |

## The per-stage loop (run identically for all four)

For each stage, in order:

1. **Assemble.** Delegate the craft to the owning playbook — read it fully first (`docs/playbooks/{art-director,scenarist,editor}.md`; researcher for site-grounded reference work). Produce the stage's artifact through `ralphy` verbs only.
2. **Eval.** `ralphy workspace eval <id>` — it scores the project against the workspace rubric and writes `workspace-eval.json` (append-only). The `criteria[]` array carries one `{ id, verdict, findings[] }` per criterion; you care about the ones this stage's gate owns.
3. **Read the per-criterion scorecard.** Pull the owned criteria from the scorecard. Cross-check with `ralphy project status <id> --contract` — a `stage-gate-unmet` stop condition names exactly which owned criterion FAILED (block) or WARNED (advisory) and which phase it gates.
4. **Repair (bounded, #473).** When an owned criterion isn't clean, run the bounded loop discipline: FREE editor fixes (`costEstimate === 0` — loudnorm, recut, caption regen, timing) auto-loop until they clear or the retry budget (default 3) is spent; the moment a fix is PAID (`costEstimate > 0` — art-director re-roll, any `ralphy generate …`), STOP and surface `pendingPaidActions`. Apply fixes through the owning playbook's verbs (`/fixer`'s routing applies — art-director regen / scenarist rewrite / editor recut). Never iterate the same failing gate more than twice without stopping to report options (`AGENTS.md` #4).
5. **Present — only on a clear (or a blocking decision).** When every owned criterion clears, show the user the stage's deliverable + a one-line scorecard summary + what the loop auto-fixed. If the loop hit a paid gate or exhausted its budget, surface the blocking decision instead (the `pendingPaidActions` / the residual findings) and the worst-case cost — the user decides whether to approve the spend or change direction.
6. **Wait for the stage approval.** Do NOT advance to the next stage until the user approves this one. This is one of the four decisions the whole skill exists to collect. Log a stage skip, if the user forces one, to `user-prompts.jsonl` (`ralphy project log-prompt --stage "skip:<phase-id>"`, per the production contract).

After stage 4 clears and the user approves, hand off to Unit formation (`ralphy unit` / `/templater`) per the production contract — the studio flow ends at an eval-cleared, user-approved render.

## How this sits with the production contract

The four stages are a user-facing VIEW of the canonical production contract (`docs/playbooks/agent-production-contract.md`): stage 1 ≈ phases reference-gate → style-lock, stage 2 ≈ scenario, stage 3 ≈ assets, stage 4 ≈ render → eval. The contract still owns the full phase order and per-phase artifacts; this skill collapses them into four approval checkpoints and adds the per-stage workspace-eval gate. Use `ralphy project status <id> --contract` as the source of truth for where the project actually is — never guess the phase from chat memory.

## References

- `cli/lib/eval/stage-loop.ts` — `runStageRepairLoop`: the bounded loop + the free/paid split (the mechanism behind every stage's repair step).
- `cli/lib/contract.ts` — `CONTRACT_PHASES` (the real phase ids) + `deriveStageGateStops` (the `stage-gate-unmet` stop conditions).
- `cli/lib/eval/workspace-criteria.ts` — the six builtin criteria + their validator ids.
- `.agents/skills/fixer/SKILL.md` — the eval-to-repair routing the per-stage repair step reuses.
- `.agents/skills/evaluator/SKILL.md` — the standalone eval skill (this one drives the workspace-eval variant per stage).
- `docs/playbooks/{art-director,scenarist,editor}.md` — the per-role playbooks each stage delegates to.
- `docs/playbooks/agent-production-contract.md` — the canonical phase order the four stages map onto.
- `MODELS.md` — read before any model pick.
