# `project log-prompt` is a soft suggestion; postmortems lose user feedback

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** playbook

## Context

`ralphy project log-prompt` writes user feedback to `user-prompts.jsonl` (the append-only source of truth for "what did the user actually ask for"). The scenarist playbook describes it as a soft suggestion. In practice, agents don't log most user turns — postmortems then have to reconstruct from chat scroll.

## What

- `noski-people-001`: workflow-fixes #6 — only 1 logged prompt across 18 user-feedback turns. Postmortem reconstruction had to guess.

## Why it matters

`user-prompts.jsonl` is the only durable record of user intent across sessions. Sparse logs make the postmortem layer unreliable, which is where most of these issues are extracted from.

## Suggested fix

- Strengthen `docs/playbooks/scenarist.md` from "may log" to "MUST log every user feedback turn" with named stages (`brief | feedback | approval | critique | rejection`).
- Cross-reference from `editor.md` and `art-director.md` — both should log when user pushes back on a render or anchor.
- Optional: Claude Code hook that nudges the agent after every user turn that lacks a `log-prompt` follow-up.

## Sources

- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — #6
