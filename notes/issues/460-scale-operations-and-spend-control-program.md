# Scale operations and spend control program

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** operations / batch / spend

## Context

"Any amount of media" implies queues, concurrency, budgets, retries,
resumability, batch review, and possibly multiple agents. The local-agent model
needs operational discipline before cloud-scale ambitions.

## What

Provide production operations for media agents: endpoint-aware queue scheduling,
spend ledger, approval scopes, retry policies, batch status, worker handoff,
progress summaries, artifact browsing, and post-run cost/quality reports. The
same primitives should work locally first and later in Desktop or cloud workers.

## Why it matters

High-volume generation without operations creates waste and confusion. At scale,
reliability and budget control become part of product quality.

## Scope / acceptance

1. **Local batch run contract.** A 100-Unit run can be planned, approved, queued,
   monitored, paused/resumed, triaged, repaired, and packaged without losing
   provenance.
2. **Spend governance.** #444 spend ledger is enforced by generation, repair,
   variant tournaments, and queue workers.
3. **Queue reliability.** #428 queue hardening supports endpoint-aware
   concurrency, retry, cancel, summaries, and known-error hints.
4. **Workboard integration.** #451 can select a weekly tranche and show which
   issues/runs are in progress without replacing `notes/issues/`.
5. **Progress reporting.** Agents can produce a clear status summary: completed,
   failed, blocked, cost, quality, next action.
6. **Artifact visibility.** Desktop and local artifact browser can inspect run
   outputs without manual `ls`.
7. **Cloud seam.** Document which parts are local-only and which abstractions
   would later become remote workers, shared storage, accounts, billing, and
   team permissions.

## Dependencies and linked work

- Content farm mode: #410.
- Queue hardening: #428.
- Spend ledger: #444.
- Workboard: #451.
- Artifact browser: #107.
- Desktop MVP: #453.

## Notes

- Local-first milestone: one agent safely runs a large batch with budget cap,
  resumable queue, and quality triage.
- Cloud execution is a later milestone, not required to prove the local factory.
