# Add a brief-to-production-plan step for agents

> **Status:** done — 2026-06-14 (ProductionPlan schema + pure buildProductionPlan() + `ralphy project plan <id> --brief` writing PRODUCTION_PLAN.md/.json, auto-versioned; deterministic mode/template/cost + one callLLM enrichment pass; satisfies the #406 contract phase-7 check)
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** high
> **Category:** producer / planning / templates

## Context

Users often enter the chat with vague creative intent. Today the agent manually maps that into a template, questions, references, model stack, cost estimate, and first checkpoint. The intake playbook describes this, but there is no durable `production-plan` artifact that downstream roles can inspect.

## What

Introduce an agent-run planning step that turns a chat brief into a structured production plan before paid generation. The plan should be saved into the project and should explain the chosen format/template, missing inputs, benchmark/reference requirements, style register, model stack, cost range, checkpoint cadence, and quality gates.

## Why it matters

Weak input should not produce weak projects. A structured plan lets the agent enrich a low-tech brief, ask only the few decisions that matter, and hand a clear contract to scenarist, art-director, editor, and evaluator.

## Scope / acceptance

- Add a production plan artifact, e.g. `<project>/PRODUCTION_PLAN.md` plus optional `production-plan.json`.
- Agent flow creates or updates the plan after template match and before scenario generation.
- Plan includes: target audience language, aspect/platform, format/template result with confidence, craft overlay, required refs, benchmark/style source, scene count/duration, audio path, model stack, cost and wall-clock estimate, first checkpoint, and bypasses.
- Consider an agent-facing verb such as `ralphy project plan <id> --brief <text>` only if it reduces drift; it must output JSON and use `callLLM()` for any LLM step.
- Intake and producer playbooks consume this artifact instead of relying only on chat memory.
- Tests cover plan creation from a minimal brief, a URL/brand brief, a remix/template brief, and a no-template freeform brief.

## Notes

- Related: #406 production contract.
- This is the replacement for a human CLI wizard: the agent plans, the user chats.
