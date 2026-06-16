# Year one media OS roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps

## Goal

By the end of the year, Ralphy should feel like a media operating system for
agents. A low-tech user should be able to ask for a campaign in chat, approve
budget and direction, then receive polished Units, distribution packs, and a
clear quality report without knowing which models, references, prompts, or
render steps were required.

The CLI remains utilitarian. Its job is to make the agent deterministic,
inspectable, resumable, and accountable.

## Definition of done

Ralphy reaches the year-one target when these workflows are boring:

1. Product URL to 10 platform-ready ad Units.
2. Source video or audio to 20 clipped Units with captions and publish copy.
3. Unknown content trend to provisional mode, benchmark set, finished Unit, and
   mode promotion proposal.
4. Failed render to eval findings, repair plan, approved fixes, improved render,
   and final Unit.
5. Finished project to reusable template, style, recipe, asset, benchmark, or
   memory entry.
6. New agent session to project resume without reconstructing context from chat.

## Year phases

### Phase 1: Substrate foundation

Target months: 1-2.

Build the runtime contract before adding surface area. The important artifacts
are the project state ledger, phase status, missing-artifact report, approval
ledger, spend ledger, machine-readable errors, and resume command. This phase
also sets the low-tech benchmark suite and agent simulator so future work can be
measured against weak user prompts rather than maintainer demos.

Primary programs:

- Agent runtime and production state.
- Research intelligence and references.
- DevEx fixtures and release gates.

Exit criteria:

- A fresh agent can enter an existing project and know the next safe action.
- A low-tech prompt can become a production plan with explicit assumptions.
- Large paid generation cannot start without required context or a logged
  bypass.

### Phase 2: Intelligence and mode depth

Target months: 3-4.

Move from generic prompting to mode-aware production. Known modes should have
mode contracts, required inputs, planning rubrics, model guidance, quality
gates, and fixtures. Unknown modes should trigger a provisional discovery path
instead of hallucinated confidence.

Primary programs:

- Content modes and open-world compiler.
- Research intelligence and references.
- Creative strategy, prompts, and models.

Exit criteria:

- At least 20 high-value modes have enough guidance to beat generic prompts.
- Unknown content creates a provisional mode profile before spend.
- Intelligence packs are consumed by plans, prompts, evals, and repair.

### Phase 3: Quality flywheel

Target months: 5-6.

Quality becomes a system instead of agent memory. Native video analysis,
artifact-specific checks, council review, readiness scoring, and repair planning
all produce one actionable report. The user sees what is blocked, what can be
fixed, and what it will cost.

Primary programs:

- Quality, eval, council, and repair.
- Agent runtime and production state.
- Creative strategy, prompts, and models.

Exit criteria:

- Every Unit has a readiness verdict.
- Repair findings map to owners and concrete actions.
- Repeated failures create durable lessons instead of repeated waste.

### Phase 4: Desktop and user workflow

Target months: 7-8.

Build the human-facing product around the stable runtime. The desktop app is a
chat plus project cockpit: artifacts, refs, plans, approvals, evals, repairs,
Units, and distribution packs.

Primary programs:

- Chat desktop and low-tech UX.
- Batch operations, scale, and cloud seam.
- Distribution and publishing.

Exit criteria:

- A non-technical user can run an end-to-end project without touching the CLI.
- Paid steps expose scope, cost, and artifact impact before approval.
- The artifact panel makes project state visible without manual file browsing.

### Phase 5: Content farm operations

Target months: 9-10.

Scale from one Unit to campaigns. Batch runs need planning, variation matrices,
queueing, triage, repair, cost rollups, and packaging. The system should detect
style drift, repeated provider failures, and weak variants.

Primary programs:

- Batch operations, scale, and cloud seam.
- Distribution and publishing.
- Library, memory, and knowledge flywheel.

Exit criteria:

- A 100-Unit local batch can be planned, approved, monitored, repaired, and
  packaged.
- Winners and failures are grouped with reasons.
- Outputs feed the library and future strategy.

### Phase 6: Compounding library and cloud seam

Target months: 11-12.

Turn production into reusable knowledge and prepare for managed execution
without rushing into cloud before local quality is repeatable.

Primary programs:

- Library, memory, and knowledge flywheel.
- Safety, trust, and governance.
- Batch operations, scale, and cloud seam.

Exit criteria:

- Successful Units can graduate into templates, styles, recipes, assets, and
  benchmarks.
- Failure lessons route to memory, models, guidelines, or issues with negative
  scope.
- Local architecture has a documented seam for future cloud workers, storage,
  accounts, billing, and team permissions.

## Year-one anti-goals

- Do not optimize for humans typing CLI commands.
- Do not build cloud workers before local quality and repair are reliable.
- Do not add hundreds of content modes before the mode compiler and eval gates
  exist.
- Do not let generation volume substitute for creative strategy.
- Do not auto-publish to platforms before packaging and safety checks are solid.
