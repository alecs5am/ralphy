# Mode fixture smoke suite

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Content modes are now part of the product surface. A mode should not be considered supported unless routing, production planning, required artifacts, and gates work together.

## What

Create a smoke suite that runs every supported mode through a no-paid-generation fixture path.

## Why it matters

Mode docs without tests drift quickly. A smoke suite makes mode support a real contract for agents.

## Scope / acceptance

- Enumerate supported modes from the content-mode registry.
- For each mode, provide a fixture brief and expected production contract.
- Assert required artifacts, research depth, ref requirements, quality gates, and Unit shape.
- Fail when a supported mode lacks a doc, fixture, guideline, or eval gate.
- Add a short command for maintainers to run the suite before changing mode routing.

## Notes

- Related: #412, #417, #418.
