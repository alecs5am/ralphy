# Agent substrate media OS program

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** strategic
> **Category:** agent-substrate / product

## Context

Strategic brainstorming on 2026-06-15. The user approved the first launch track:
Ralphy should become the best execution substrate for agents that produce media.
The product promise is not "humans use a CLI"; it is "turn Claude Code, Codex,
and similar agents into reliable content factories."

## What

Turn Ralphy into an agent-native media operating system. The CLI remains
utilitarian and machine-readable, while the agent uses it to manage project
state, content modes, research, reference packs, model routing, generation,
queueing, validation, repair, Unit formation, provenance, and distribution.

This is a program issue: it does not replace the smaller implementation issues.
It defines the launchable substrate track and the minimum bar for saying Ralphy
is an agentic media factory rather than a set of generation helpers.

## Why it matters

Agents are already the real interface. If the substrate is strong, many chat
surfaces can use it: Codex, Claude Code, Ralphy Desktop, CI jobs, or future
cloud workers. If the substrate is weak, every interface inherits the same
agent-dependent output quality.

## Scope / acceptance

1. **Agent contract.** Document the agent-substrate contract in one canonical
   place: which project state is inspectable, which verbs are safe to call, what
   must be persisted, and which stages require user approval.
2. **Project state and resume.** Add or standardize a command/artifact that lets
   a fresh agent answer: current phase, missing artifacts, next safe action,
   last eval, spend state, and blocking decisions.
3. **Production contract.** Tie together mode compiler, research, ref pack,
   production plan, spend ledger, eval gates, repair plan, Unit packaging, and
   distribution pack as one coherent state machine.
4. **Machine-readable CLI.** Every agent-facing command used in the production
   contract must have stable JSON output, pretty-output coverage where relevant,
   and actionable errors.
5. **Golden demos.** Maintain at least three local proof workflows:
   - product/site to ad creative pack;
   - source video/audio to short Units;
   - open-world unknown brief to provisional mode to finished Unit.
6. **No human wizard drift.** Human CLI usage may exist for debugging, but the
   default path should assume an agent is driving Ralphy on behalf of a chat user.

## Dependencies and linked work

- Positioning and production contract: #404, #406.
- Content farm and Unit lifecycle: #410, #414.
- Mode compiler and open-world follow-up: #418, #454.
- Provenance/readiness/distribution: #420, #423, #427.
- Low-tech testing: #430, #431, #446.

## Notes

- Sequence this as the north-star umbrella for the next several months.
- The test for success is not "can a maintainer run the CLI"; it is "can a new
  agent enter a project and continue high-quality media production without
  reconstructing context from chat history."
