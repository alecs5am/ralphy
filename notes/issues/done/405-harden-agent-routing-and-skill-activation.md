# Harden agent routing and skill activation

> **Status:** done — 2026-06-14 (shipped the enforceable H3 pieces: lint:skill-routing flagging trigger-less/conflated descriptions, routing-coverage fixtures for the key utterances, both wired into CI; the rules/ body-decomposition is deferred to the #058 niche-skill templatization)
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** high
> **Category:** agents / skills / routing

## Context

The quality problem is not that low-tech users fail to run the CLI. They mostly chat with an agent. The failure mode is that the agent sometimes under-routes, skips the right playbook or skill, or keeps too much of the production discipline as informal prompt context.

`docs/research/skill-activation.md` already diagnosed the older version of this: routing competes with large prompt context, skill descriptions are noisy, and monolithic skill bodies increase context cost. That research is not represented as an active executable issue.

## What

Turn the skill-activation research into an implementation pass for the current repo shape. The goal is that a fresh Codex or Claude Code session reliably routes a chat request to the right role, loads only the needed rules, and treats missed routing as a defect.

## Why it matters

Ralphy's real interface is agent chat. If routing underfires, every downstream quality gate becomes optional in practice. Tightening activation raises project quality without asking the end user to know models, playbooks, or CLI steps.

## Scope / acceptance

- Re-audit current `AGENTS.md`, `.agents/skills/*/SKILL.md`, and installed skill metadata against `docs/research/skill-activation.md`.
- Produce the minimal current H3 implementation: short trigger-forward skill frontmatter, rule indexes, and role-specific sub-doc pointers where bodies are still too monolithic.
- Keep the root router readable and high-signal; do not bury routing under general project context.
- Add or update a lint that catches skills with overly broad descriptions, missing trigger examples, or descriptions that conflate several unrelated intents.
- Add fixture tests for key user utterances: new video, URL research, rendered mp4 evaluation, repair request, batch/content farm request, poster, carousel, FB ad pack, and publish copy.
- `bun run lint:skills`, `bun run lint:agents-md`, and `bun test` pass.

## Notes

- Sequence before the production-pipeline issues below; better pipelines still fail if the agent does not load them.
- Related: #117 (chat-native memory), #403 (social copy skill), `docs/research/skill-activation.md`.
