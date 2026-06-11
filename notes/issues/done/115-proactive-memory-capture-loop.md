# Proactive memory capture: close the per-chat learning loop

> **Status:** done — 2026-06-11
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

#112-#114 landed the store, the distill verb, and recall-at-intake — but the
loop only closes when someone manually runs `/postmortem` + `distill`. The
hermes-agent reference closes it per-turn: proactive WHEN-TO-SAVE guidance in
the tool schema, a background review after turns, and turn-count nudges. The
chat-native analog for Ralphy: the agent captures during the session and
reviews at session end.

## What

1. **AGENTS.md invariant #18 — proactive capture.** When the user corrects
   the agent, expresses a durable preference, says "remember this", or a
   non-trivial fix/technique emerges: capture it THEN, not at session end.
   Explicit user remark → `ralphy memory note` (the remark is its own
   consent); agent-inferred lesson → `ralphy memory propose` (user approves).
   Carries the do-not-capture list (env-dependent failures, negative tool
   claims, transient errors, task narratives).
2. **`memory-review` skill** (namespace user) — the lightweight session-end
   review, adapted from hermes' background-review prompt: scan the
   conversation for signals (corrections, frustration, techniques, model
   facts), prefer UPDATE-over-NEW (search active entries first; overlap →
   re-note the survivor slug), route artifact-bearing lessons to guidelines,
   stage the rest as proposals and surface them for approve/reject. Fires on
   "/memory-review", "what should we remember", and proactively before a
   session wraps after ≥1 correction (lighter than /postmortem; postmortem
   keeps its own distill step).

## Scope / acceptance

1. AGENTS.md invariant #18 (tight — a paragraph, not a section);
   `lint:agents-md` green.
2. `.agents/skills/memory-review/SKILL.md` + `.claude/skills` symlink;
   `lint:skills` green (name regex, ≤1536-char description, namespace).
3. Cross-link from the postmortem skill's distill step (postmortem = deep
   path, memory-review = light path).
4. English-only; no CLI changes (agent-side discipline only).

## Notes

- Hermes nudge-counter has no chat-native equivalent; the trigger list in the
  skill description is the substitute.
- Sequence after #112 (verbs exist). Pairs with #116 (curate).
