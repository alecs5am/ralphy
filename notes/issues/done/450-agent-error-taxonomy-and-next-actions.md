# Agent error taxonomy and next-action hints

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Many provider and CLI errors already have known fixes: reduce concurrency, shorten prompt, switch model, add refs, strip metadata, retry transient errors, or ask the user for proof. The agent should not rediscover these fixes from raw stack traces.

## What

Create an agent-facing error taxonomy that maps common errors to root cause, severity, retry policy, and next action.

## Why it matters

Better error handling reduces wasted turns and keeps agents inside Ralphy primitives instead of improvising.

## Scope / acceptance

- Define error classes for provider transient, provider semantic, moderation, missing refs, bad paths, model constraints, budget, eval failure, and artifact mismatch.
- Map known error strings into classes.
- Attach recommended next actions and fallback models where applicable.
- Surface the taxonomy in CLI errors and queue summaries.
- Add tests for representative errors from recent postmortems.

## Notes

- Related: #445 model constraint preflight and #428 queue hardening.
