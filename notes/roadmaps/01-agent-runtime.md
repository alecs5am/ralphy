# Agent runtime and production state roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #452, #406, #407, #444, #450

## Purpose

Make Ralphy the reliable execution substrate for agents. The runtime should let
an agent answer: what project is active, what phase it is in, what artifacts
exist, what is missing, what user approvals are required, what spend is allowed,
what failed, and what the next safe action is.

## Target capabilities

- Agent-facing project status with stable JSON.
- Single production phase ledger.
- Durable approval and spend ledgers.
- Resumable task state after agent restart.
- Actionable errors with next steps.
- Safe command contracts for generation, render, eval, repair, Units, and
  distribution.
- Project handoff reports that do not depend on chat history.

## Workstreams

### Production state machine

Define every canonical phase and the minimum artifact each phase produces:
brief, mode profile, intelligence pack, creative strategy, production plan,
scenario, prompts, assets, render, eval, repair plan, Unit, distribution pack,
postmortem, and reusable knowledge proposal.

Issue families:

- Phase registry and schema.
- Phase transition rules.
- Skip and bypass logging.
- Blocking decision representation.
- Pretty and JSON output coverage for status.
- Tests for partial, failed, and completed projects.

### Resume and handoff

The main agent primitive should be a resume report. It should be concise enough
for chat but structured enough for tools.

Issue families:

- `project status --contract` extensions.
- "next safe action" engine.
- Missing artifact report.
- Last failure summary.
- User-decision queue.
- Cross-agent handoff Markdown.
- Snapshot fixtures for broken projects.

### Approval and spend governance

Paid generation, repair, batch expansion, and provider retries need explicit
approval scope. The runtime should prevent accidental spend, not merely report
it afterward.

Issue families:

- Approval scope schema.
- Spend ledger writes from every paid action.
- Retry budget enforcement.
- Provider-cost estimate surfaces.
- Desktop approval event shape.
- Tests for denied, expired, and exceeded approvals.

### Agent errors and next actions

Errors should be useful to an agent. Every expected failure class should say
what happened, whether it is retryable, who owns it, and which command to run
next.

Issue families:

- Error taxonomy expansion.
- Provider failure normalization.
- Missing-reference errors.
- Model constraint errors.
- Render failure summaries.
- Recovery cookbook links.
- Pretty-output assertions for common errors.

## Acceptance ladder

1. Fresh project status works.
2. Failed project status works.
3. Completed Unit status works.
4. A new agent can resume a project from disk without chat context.
5. Paid actions are blocked unless approval exists or bypass is logged.
6. Desktop can consume the same state without special parsing.

## Example issues to file later

- Add a typed `nextAction` block to project status output.
- Add a user-decision queue to project status.
- Normalize generation, render, eval, and repair failures into one action model.
- Add fixtures for projects stopped at each production phase.
- Add a CLI smoke test for resume after failed render.
