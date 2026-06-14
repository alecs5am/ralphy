# Release readiness scorecard

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Native-video eval, council review, style lock, and repair plans all produce useful signals. The agent still needs one final release-readiness scorecard that explains whether a Unit is shippable for its mode and why.

## What

Create a mode-aware readiness scorecard that summarizes hook, clarity, product fidelity, style fit, pacing, audio, captions, platform fit, originality, technical polish, distribution readiness, and residual risk.

## Why it matters

Pass/fail alone is too opaque, while free-form critique is too hard to automate. A scorecard gives users a clear readiness verdict and gives agents stable thresholds for repair or packaging.

## Scope / acceptance

- Define a scorecard schema with mode-aware dimensions and thresholds.
- Ingest native-video eval, product fidelity gate, council output, style lock checks, and distribution pack status.
- Emit a final verdict: `ship`, `repair`, `needs-user-decision`, or `blocked`.
- Persist the scorecard in the project and link it from Unit provenance.
- Prevent `ralphy unit create --polished` or equivalent polished status unless thresholds pass or the user explicitly bypasses.
- Add fixtures for one passing Unit, one repairable Unit, and one blocked Unit.

## Notes

- Related: #411, #415, #422, #423, and #414.
