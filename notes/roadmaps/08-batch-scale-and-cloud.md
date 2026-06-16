# Batch operations, scale, and cloud seam roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #410, #428, #444, #451, #460, #462

## Purpose

Support media production in volume without losing budget control, quality, or
provenance. The first milestone is local reliability. The future cloud seam
should be clear, but cloud execution should not be built before local workflows
are repeatable.

## Target capabilities

- Batch planning and approval.
- Queue scheduling with provider-aware concurrency.
- Pause, resume, retry, cancel, and summarize.
- Spend caps and retry budgets.
- Batch triage with winners, failures, repairs, and cost rollup.
- Artifact visibility across large runs.
- Future cloud boundary for workers, storage, accounts, and billing.

## Workstreams

### Local batch contract

Issue families:

- Batch manifest schema.
- Variation matrix ingestion.
- Per-item state ledger.
- Batch-level approval.
- Batch status JSON.
- Pause and resume.
- Batch postmortem.

### Queue operations

Issue families:

- Provider-aware concurrency.
- Endpoint rate limits.
- Retry backoff.
- Cancel semantics.
- Failed item isolation.
- Queue recovery after process crash.
- Worker summary reports.

### Spend controls

Issue families:

- Batch budget estimate.
- Per-provider cost tracking.
- Retry budget enforcement.
- Approval scope expiration.
- Over-budget blocking.
- Cost rollup by Unit, batch, provider, and mode.

### Batch quality and triage

Issue families:

- Batch review command.
- Winner grouping.
- Failure clustering.
- Style drift detection.
- Repeated model failure detection.
- Bulk repair proposal.
- Unit selection workflow.

### Cloud seam

Issue families:

- Job id and artifact URI abstraction.
- Remote worker API sketch.
- Shared storage boundary.
- Secret ownership model.
- Team permissions sketch.
- Billing ownership sketch.
- Abuse and cost risk register.

## Acceptance ladder

1. Ten-Unit local batch can run with budget cap.
2. Failed items do not corrupt the batch.
3. Batch can resume after interruption.
4. Batch review groups winners and failures with reasons.
5. A 100-Unit local batch can be monitored and summarized.
6. Cloud seam document identifies which local assumptions must stay portable.

## Example issues to file later

- Add per-item state ledger to batch manifests.
- Add provider-aware queue concurrency configuration.
- Add batch cost rollup report.
- Add batch review style-drift detection.
- Add cloud portability checklist to architecture docs.
