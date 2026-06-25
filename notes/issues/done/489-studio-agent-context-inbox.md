# Studio agent context inbox

> **Status:** done — 2026-06-25
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** high
> **Category:** studio / agent-context / orchestration

## Context

The user wants Studio to support quick "send this back to Claude Code" loops. Claude Code should remain the decision-maker and should drive local API / ralphy verbs. Studio should prepare structured context by writing files, not by trying to run complex production logic itself.

## What

Add a Studio-to-agent inbox. When the user selects objects and chooses an action such as repair, approve, compare, use as reference, or publish, Studio writes a paired Markdown and JSON context pack under the active run or project. Claude Code can then read that file directly from chat or via a small CLI listing command.

## Why it matters

This removes copy-paste ambiguity. The user can validate visually in Studio, click once, and hand the exact selection, notes, tags, and requested action back to the chat agent.

## Scope / acceptance

- Add an inbox storage convention such as `agent-inbox/<timestamp>-<action>.md` plus `.json` under the run, falling back to the project when no run is active.
- Define a JSON schema with `kind`, `action`, `workspace`, `run`, `project`, `selected[]`, `tags[]`, `note`, and `requestedOutcome`.
- Studio can create inbox items from selected annotations/artifacts/eval findings.
- Markdown output is readable by a human agent and includes absolute or workspace-relative paths that can be pasted as `@` context.
- Add a CLI read surface such as `ralphy studio inbox list/show` or an equivalent run/project namespace.
- Agent-facing docs mention that the inbox is context, not an instruction to spend money without approval.
- Tests cover schema validation, markdown generation, and Studio API write safety.

## Notes

- Depends on #488 for stable selected-object annotations.
- Keep execution out of Studio. The inbox carries intent; Claude Code still chooses and runs the actual ralphy commands.
