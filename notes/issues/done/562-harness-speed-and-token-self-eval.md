# Harness speed and token self-eval

> **Status:** done — 2026-10-28 (scripts/session-report.ts + baseline in docs/research/harness-baseline-2026-10.md; follow-ups #572-#575)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** eval / agent performance

## Context

The owner asked for speed and price of tools. Paid-provider benchmarks are deferred. The harness side is free to measure: how long the agent takes per production phase, how many tokens and tool calls it spends, and where it wastes them. Targets exist in `docs/perf-targets.md` (8 min cold single video, 25 min for a batch of 10) but nothing measures them from real sessions.

## What

- A script that reads agent session transcripts (Claude Code and Codex session logs) plus the project's `logs/` and gen-log, and attributes wall time, tokens and tool calls to contract phases (intake, research, scenario, prompts, assets, render, eval).
- A waste report: repeated reads of the same file, failed-and-retried commands, verbs invoked with wrong flags, long idle waits on background jobs, skills read but unused.
- A baseline over the last N real sessions and a short list of fixes (skill trims, missing verbs, better defaults) filed as follow-up issues.

## Scope / acceptance

- `scripts/session-report.ts <transcript...>` (maintainer tool, run with bun) prints the per-phase table and the waste list.
- `docs/research/harness-baseline-2026-10.md` with the baseline and comparison against `docs/perf-targets.md`.
- No provider calls; tests on fixture transcripts.

## Notes

- Paid-tool latency and price benchmarks: separate issue later, when the owner asks.
