# Per-stage auto-assemble → eval → auto-repair loop

> **Status:** done — 2026-06-18
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** high
> **Category:** workflow / repair

## Context

For each stage to assemble "right the first time," it must auto-run its eval and auto-repair until the hard threshold clears BEFORE presenting to the user. This is the mechanism behind the user's first-time-right ask — they review polished output, not drafts.

## What

A bounded loop that, per stage: assembles → runs `ralphy workspace eval` for that stage's criteria (#469/#472) → if not passing, generates/updates a repair plan (#409) and applies targeted fixes → re-evals → repeats up to a retry budget → presents to the user on pass (or surfaces a blocking decision).

## Why it matters

Without the loop, the gates only DETECT problems; this is what makes the workflow actually deliver clearing output to the user with minimal hand-holding.

## Scope / acceptance

- Reuse the repair loop (`cli/lib/repair.ts` / the `/fixer` flow) and the readiness verdict (#427). Do not reinvent.
- Bounded: explicit retry budget, NO endless critique loops.
- **Paid-generation gate (mandatory).** Auto-apply only FREE editor fixes; STOP for the user before any paid re-generation unless they pre-approved batch repair (AGENTS.md invariant).
- A library entry the studio skill (#474) calls per stage; emits the per-stage verdict + a list of what it auto-fixed.

## Dependencies and linked work

- Runner #469, criteria #470, stage-gate map #472, repair loop #409, readiness #427.
- Complements quality flywheel #457.

## Notes

- The free-vs-paid split mirrors the choose-silenthill-003 session: overlay/audio/timing fixes are free and loop automatically; i2v/anchor re-gen stops for approval.
