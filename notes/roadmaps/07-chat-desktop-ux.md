# Chat desktop and low-tech UX roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #430, #431, #453

## Purpose

Make the agent-native production engine usable by non-technical users. The user
should talk in chat, review artifacts, approve spend, request changes, and ship
Units without understanding CLI commands or model details.

## Target capabilities

- Chat is the main interface.
- Project panel shows live state and artifacts.
- Approvals are explicit and understandable.
- Eval and repair reports are visible and actionable.
- Low-tech prompts are transformed into strong briefs.
- Users can operate batches without reading project folders.

## Workstreams

### Low-tech intake

The system should not punish weak prompts. It should infer what it can, ask only
what blocks production, and show assumptions before spend.

Issue families:

- User skill profile consumption.
- Brief completeness scoring.
- Assumption extraction.
- Single-question disambiguation.
- Novice-friendly confirmation summaries.
- Low-tech benchmark prompts.
- Agent-user simulator.

### Desktop project cockpit

The UI should make project state obvious.

Issue families:

- Workspace and project selector.
- Artifact panel.
- Phase timeline.
- Intelligence pack summary.
- Production plan review.
- Spend and approval panel.
- Eval findings panel.
- Repair approval panel.
- Unit gallery.
- Distribution pack panel.

### Agent bridge

The desktop app should drive local agents and Ralphy without inventing a second
production engine.

Issue families:

- Agent process spawn and stream.
- Tool event parsing.
- Ralphy JSON event mapping.
- Error recovery.
- Project cwd scoping.
- Agent auth and billing warning.
- Safe stop and resume.

### UX for scale

Batch work needs a different surface than single-output work.

Issue families:

- Batch progress table.
- Winner/failure grouping.
- Cost rollup.
- Bulk repair approval.
- Unit selection.
- Publish pack export.
- Postmortem summary.

## Acceptance ladder

1. A user can create/select a project in Desktop.
2. The agent can run a project while the UI shows artifacts and phases.
3. Paid steps require clear approval.
4. Eval findings and repair plans are understandable to non-technical users.
5. A low-tech benchmark user can complete a single Unit.
6. A low-tech benchmark user can complete a small batch.

## Example issues to file later

- Add Desktop phase timeline bound to project status JSON.
- Add low-tech brief completeness panel.
- Add approval modal for paid generation scopes.
- Add artifact gallery for refs, renders, evals, Units, and distribution packs.
- Add batch triage UI for winners, failures, and repairs.
