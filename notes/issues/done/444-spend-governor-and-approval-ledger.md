# Spend governor and approval ledger

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

The agent-facing pipeline must ask for approval before paid generation, estimate cost, and stop when retry budgets are exhausted. The behavior exists across playbooks, but not as a single persisted spend ledger.

## What

Add a spend governor that tracks approved budget, estimated spend, actual spend, remaining retry budget, and user approvals per project or batch.

## Why it matters

Content farms can burn money quickly. A ledger makes spend control auditable and lets agents continue work without re-asking or overspending.

## Scope / acceptance

- Add a project-local spend/approval artifact.
- Record approval scope, budget cap, allowed modes, expiry, and user-facing reason.
- Check the ledger before paid generation and repair loops.
- Compare estimated versus actual spend after each batch.
- Add a hard stop when spend would exceed approved budget.
- Add tests for approved, over-budget, expired, and bypassed cases.

## Notes

- Related: #406 production contract, #407 production plan, #421 variant tournament.
