# Required eval fixes after the gate audit

> **Status:** done — 2026-10-28 (full-video verdict calibrated: agreement 20/29 to 28/29, kappa 0.00 to 0.92; deep-vision proxy under the 20 MB limit; eval cost logged; info findings out of repair plans)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** eval / bug

## Context

The #569 audit (`docs/research/gate-audit-2026-10.md`) found that the full-video model pass, the only ship gate, marked ship-ready on 0 of 29 stored runs while making the most valuable true catches, plus three defects. Only the required items are filed here; the rest of the audit's follow-ups are not scheduled.

## What

1. **Calibrate the full-video pass.** Label the 29 stored runs (ship-ready yes/no with reason) from the renders, check the suspects named in the audit (the "first 3 s" sub-check and the "two warns make a warn" rule), and change thresholds or aggregation so ship-ready verdicts match the labels; keep its true catches (undelivered payoff, missing brief pose, register mismatch).
2. **Deep-vision size cap bug.** The cap is 40 MB but the provider rejects bodies over 20 MB with HTTP 413; cap at the real limit and downscale or trim before upload.
3. **Log eval cost.** Write `cost_usd` for eval model calls so cost per gate is measurable.
4. **Keep info-level findings out of repair plans.**

## Scope / acceptance

- Calibration table in the audit doc: before/after agreement with labels on the 29 runs.
- A test for the size cap and one for repair-plan filtering; eval runs record cost.
- Affected tests, `bunx tsc --noEmit -p .`, `lint:out-coverage` pass.
