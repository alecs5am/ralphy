# Agent user simulator for intake and repair flows

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

The agent must handle users who answer briefly, omit important constraints, change their mind, or approve paid generation too early. Static prompt fixtures catch routing, but not multi-turn behavior.

## What

Build a small simulator that plays scripted user personas against the intake, planning, council, and repair flows. It should validate that the agent asks only necessary questions, preserves user choices, and does not spend before approval.

## Why it matters

Low-tech UX is mostly multi-turn. A single prompt benchmark cannot catch over-questioning, missing approval gates, or losing context between steps.

## Scope / acceptance

- Define 4-6 simulated personas: terse founder, impatient marketer, vague creator, brand-safe client, and budget-sensitive buyer.
- Add scripted conversations with expected phase transitions and approvals.
- Validate no paid-generation step appears before the relevant approval.
- Validate the agent can recover after a user changes product, platform, or style mid-flow.
- Output a compact test report that lists failed turns and expected behavior.

## Notes

- Related: #406 agent production contract, #407 production plan, #414 Unit lifecycle.
