# Quality flywheel orchestrator

> **Status:** done — 2026-06-23 (verified existing #427/#411/#425 flywheel; added named gate registry + fixtures + doc)
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** quality / eval / repair

## Context

Ralphy now has or is tracking native video validation, council review, repair
plans, OCR/text gates, first-frame gates, caption sync, claims/policy checks,
platform specs, and release readiness. These should behave as one bounded
quality flywheel rather than separate reports an agent has to manually combine.

## What

Create a quality orchestrator that runs the relevant gates for a project or
Unit, merges findings, produces a single readiness verdict, and triggers the
repair-plan flow when the Unit is not shippable.

## Why it matters

Quality cannot depend on an agent remembering every gate. A systematic flywheel
lets low-tech users get polished results and lets agents improve future runs
from concrete failures.

## Scope / acceptance

1. **Gate registry.** Define which gates apply by mode/format/platform:
   native-video, structure, OCR, first-frame hook, captions, product fidelity,
   claims, platform specs, distribution pack, and council.
2. **Single run command or library entry.** Provide an agent-facing way to run
   quality for a Unit/project and get one JSON report.
3. **Finding merge.** Normalize findings across gates into severity, owner,
   artifact, suggested fix, cost/risk, and blocking status.
4. **Readiness verdict.** Emit `ship`, `repair`, `needs-user-decision`, or
   `blocked`, matching #427.
5. **Repair handoff.** Generate or update the repair plan from merged findings,
   preserving approval and spend rules.
6. **Lesson routing.** When the same failure repeats, hand off to #425 rather
   than burying it in a report.
7. **Fixtures.** Add one passing Unit, one repairable Unit, and one blocked Unit
   with multiple gate findings.

## Dependencies and linked work

- Native video validation: #411.
- Council: #415.
- Failure lessons router: #425.
- Readiness scorecard: #427.
- OCR/hook/caption/claims/platform gates: #439, #440, #441, #442, #443.
- Repair loop: #409.

## Notes

- Keep the flywheel bounded: explicit retry budgets, no endless critique loops,
  and user approval before paid repair.
