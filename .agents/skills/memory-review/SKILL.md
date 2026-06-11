---
name: memory-review
namespace: user
description: >-
  Lightweight end-of-session memory review — scan the conversation just had for durable lessons and stage them into Ralphy's tiered memory (`ralphy memory note` / `propose`), so the next session starts already knowing. The chat-native analog of hermes-agent's background self-review: signals are user corrections, frustration ("stop doing X", "I told you already"), durable preferences, model/provider facts discovered the hard way, and non-trivial fixes a future session would re-derive. Lighter than /postmortem — no 7-file set, no LLM call; the agent reads its own conversation and writes 0-5 entries.
  USE WHEN the user types "/memory-review", asks "what should we remember from this", "save the lessons", "update your memory", or a work session is wrapping up after >=1 user correction / re-roll / model swap (fire proactively then). DO NOT FIRE when a full postmortem is warranted (>=2 corrections or >=1 CLI gap — that is /postmortem, which ends with `ralphy memory distill`); for capturing ONE remark mid-flight (that is invariant #18 — note it immediately, no review pass needed); for dev-mode sessions on the Ralphy repo itself (lessons go to notes/, not memory).
  See body for the signal list, the do-not-capture list, and HARD INVARIANTS.
---

# memory-review — close the loop on the session you just had

The cheap half of Ralphy's learning loop. Recall (`AGENTS.md` step 0) loads
memory INTO a session; this skill writes the session's lessons BACK. Between
them sits invariant #18 (capture corrections the moment they land). Run this
when a session winds down and something was learned but nobody asked for a
full postmortem.

## Workflow

1. **Scan the conversation** for signals, newest first:
   - **User corrections** — model pick, register, pacing, aspect, voice,
     phrasing the user changed after seeing output. The strongest signal:
     it cost the user a turn, and uncorrected it will cost one again.
   - **Frustration markers** — "stop doing X", "again?", "I already said",
     "why is it doing Y". First-class signals, not noise.
   - **Durable preferences** — anything phrased as "always / never / by
     default" about look, sound, structure, or workflow.
   - **Discovered facts** — a model filter hit, a provider quirk, a flag
     that behaved unexpectedly, a workaround that held.
   - **Techniques that worked** — a prompt pattern, a recipe, a sequence
     that future-you would otherwise re-derive.

2. **Filter through the do-not-capture list** (same as `ralphy memory
   distill` and invariant #18):
   - environment-dependent failures (missing key/binary/dep) — capture the
     FIX if there was one, never the failure;
   - negative tool/model claims ("X is broken") — they outlive the bug and
     harden into refusals;
   - transient errors a retry solved — the lesson is the retry pattern;
   - task progress, outcomes, narratives — `logs/` + `postmortem/` territory;
   - anything already covered by the repo (MODELS.md, guidelines, playbooks)
     or by an existing memory entry that does not need changing.

3. **Dedupe against the store.** For each survivor: `ralphy memory search
   <keyword>`. Overlap → re-note the existing slug (the store versions it
   up); no overlap → new slug, class-level name (no project ids, no error
   strings).

4. **Write, tiered:**
   - Explicit user statements from this session → `ralphy memory note ...`
     directly (their words = consent). Client/universe facts get
     `--workspace`; cross-project craft/model/tooling stays global.
   - Agent-inferred lessons → `ralphy memory propose ...`, then list the
     proposals (slug + description + tier) and let the user
     `approve <slug>` / `reject <slug>` / `approve --all`.
   - Every body carries the rule + `**Why:**` + `**How to apply:**` +
     `**Does NOT apply to:**` — a vague negative scope is grounds to keep
     drafting (#045 over-application lesson).

5. **Report one tight block in chat:** noted (active) entries, staged
   proposals awaiting approve, and anything deliberately skipped with the
   one-word reason (covered / transient / narrative).

## Health check hand-off

While in the store: if `ralphy memory list` shows more than ~70 active
entries in a tier, or any write bounced with `E_MEMORY_CAP_EXCEEDED` this
session, suggest a `ralphy memory curate` pass (#116) — consolidation is its
job, not this skill's.

## HARD INVARIANTS

- **0-5 entries per session.** More means you are logging, not curating —
  cut to the ones that change a future decision.
- **Never silently promote an inference.** Agent-derived lessons go through
  `propose` → user `approve`. Only the user's own explicit statements go
  straight to `note`.
- **Update over new.** Search first; an overlapping slug is re-noted, never
  cloned into a sibling.
- **"Nothing to save" is a valid outcome** — say it in one line and stop.
  A session with no corrections and no discoveries produces no entries.
- **English on disk** — memory entries are English regardless of chat
  language (translate the user's remark, keep their meaning).
- **No paid calls.** This skill is the agent reading its own conversation —
  if you are reaching for `callLLM`, you want `/postmortem` + `ralphy memory
  distill` instead.
