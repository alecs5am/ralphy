# Chat-native auto-learning: memory loads and writes itself

> **Status:** done — 2026-06-11
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

Product decision 2026-06-11 (supersedes the user-approved-only ingestion
choice from idea 013): the ralphy CLI is an agent-facing surface — end users
only ever chat. The learning loop must run with zero user ceremony: memory
loads automatically when a session starts or a workspace becomes active, and
the agent saves lessons automatically as the chat happens (especially
error→fix moments), with one-line transparency in chat instead of an approve
step.

## What

1. **Auto-recall, mechanically.** Bare `ralphy` (the step-0 status call)
   embeds a `memory` digest (count + index lines, recall cap) in its JSON, so
   loading memory requires no separate discipline-driven call. `ralphy
   workspace use <slug>` embeds the same digest for the workspace being
   activated (mid-session switch = fresh facts). A repo `.claude/settings.json`
   SessionStart hook runs `ralphy memory recall` so the digest enters agent
   context even before the first tool call.
2. **Auto-capture, transparently.** AGENTS.md invariant #18 flips from
   propose-and-wait to write-and-tell: explicit user remarks AND
   agent-inferred lessons (error hit → fix found → rule) go straight to
   `ralphy memory note`; the agent reports `saved to memory: <slug>` in chat;
   "forget that" → `ralphy memory retire <slug>`. The do-not-capture list
   stays. `proposed/` staging remains the path for BULK ingestion only
   (distill, curate merges) where one chat line per entry would be noise.
3. **memory-review skill** updated to the same semantics (write directly,
   report, offer retire).

## Scope / acceptance

1. Bare `ralphy` JSON gains `memory: {workspace, count, truncated, entries[]}`
   (slug/description/tier index lines; omitted on store errors). Unit test.
2. `workspace use` output gains the target workspace's digest. Unit test.
3. `.claude/settings.json` (checked in) with the SessionStart recall hook.
4. AGENTS.md #18 + step 0 rewritten; memory-review skill updated;
   `lint:agents-md` + `lint:skills` green.
5. English-only; surface/docs regen.

## Notes

- Decision note: auto-ingestion accepts some noise; the guardrails are the
  100-entry cap, `curate`, `retire`, and chat transparency (the user sees
  every save and can immediately undo). This is the hermes trade: its
  background review also writes directly, bounded by store limits.
- Sequence after #112/#115/#116.
