# Define an agent production contract for chat-to-render projects

> **Status:** done — 2026-06-14 (docs/playbooks/agent-production-contract.md 15-phase contract; ralphy project status --contract via pure evaluateContract() in cli/lib/contract.ts; intake/producer/AGENTS defer to it)
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** high
> **Category:** agents / producer / project-state

## Context

The current playbooks describe the right steps, but the end-to-end contract is spread across intake, producer, scenarist, art-director, editor, evaluator, memory, and CLI help. For chat users, the agent should behave like a reliable producer: brief in, project plan, gated generation, render, eval, fix loop, unit/output.

## What

Create a single agent-facing production contract that every "make content" request follows. It should define phases, required artifacts, allowed skips, user checkpoints, and stop conditions. The CLI remains utilitarian: it exposes project status and primitives the agent can call, but the human-facing experience is the chat loop.

## Why it matters

Low-quality projects often come from agents improvising the workflow: weak brief capture, no benchmark lock, skipped scenario score, bulk generation before the first approval, or final render without eval. A production contract gives every agent the same rails.

## Scope / acceptance

- Add a concise source-of-truth contract doc, likely `docs/playbooks/agent-production-contract.md`.
- Contract covers: intake, format/template match, memory recall, reference gate, benchmark/style grounding, scenario quality, prompt/generation gates, render preflight, eval, repair, unit formation, and postmortem/memory capture.
- Update `AGENTS.md`, `docs/playbooks/intake.md`, and `docs/playbooks/producer.md` to point to the contract instead of restating divergent flows.
- Add a project-status checklist surface for agents if needed, e.g. `ralphy project status <id> --contract`, returning missing artifacts and next recommended action.
- Include explicit bypass handling: every skip must require user intent and be logged to `user-prompts.jsonl`.
- Tests cover the project-status contract on draft, scenario, assets, render, and evaluated project fixtures.

## Notes

- This is not a human CLI wizard. Any new CLI output is machine-readable guidance for agents.
- Sequence after #405; this contract becomes the routing target.
