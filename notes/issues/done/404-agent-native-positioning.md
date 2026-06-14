# Agent-native positioning is not explicit enough

> **Status:** done — 2026-06-14
> **Filed:** 2026-06-14
> **Folder:** issues
> **Severity:** medium
> **Category:** product / docs / install

## Context

User correction on 2026-06-14: Ralphy is a tool for agents. End users should not be expected to operate the CLI directly; they enter a chat with Codex, Claude Code, Cursor, or a future desktop surface, and the agent drives Ralphy. The right user-facing promise is closer to "Turn your Claude Code into a content farm."

## What

Audit and tighten the public and in-repo positioning so every surface frames Ralphy as an agent-facing execution substrate: the CLI gives agents reproducible model calls, project state, quality gates, renders, logs, and memory. Human CLI usage remains available for setup, debugging, and power users, but it is not the product's primary workflow.

## Why it matters

If the docs sell Ralphy as a normal human-operated CLI, the roadmap drifts toward onboarding wizards and command ergonomics for low-tech users. That optimizes the wrong interface. The product gap is making chat-driven agents reliably produce high-quality content at farm cadence.

## Scope / acceptance

- README hero, "What it is", tour, and comparison table state that the agent is the operator and the user works through chat.
- Install/setup docs still document direct commands, but describe them as agent enablement and diagnostics.
- Landing copy and library CTA use a content-farm framing without implying users must learn the CLI.
- `AGENTS.md` and the relevant playbooks include a short positioning note: chat is the user interface; Ralphy CLI is the agent runtime.
- No docs introduce a human-facing project wizard as the primary solution for novice users.
- Run `rg '\p{Cyrillic}' --pcre2 README.md AGENTS.md docs docs-mintlify landing -g '*.md' -g '*.mdx' -g '*.tsx'` and the relevant docs lints.

## Notes

- Related: #117 already landed the same principle for auto-memory. This issue applies it to product positioning and roadmap steering.
- Keep CLI reference docs complete; this issue changes framing, not the command surface.
