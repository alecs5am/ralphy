# Intake recall: load memory into agent context at routing time

> **Status:** todo
> **Filed:** 2026-06-11
> **Folder:** issues

## Context

Promoted from idea 013. Storage and verbs land in #112; this issue makes the
memory actually reach the agent at the moment it matters — intake — without
bloating every session's context.

## What

Wire `ralphy memory recall` into the operating discipline:

1. **AGENTS.md step 0:** alongside the existing user-profile load, the agent
   runs `ralphy memory recall` (global + active workspace) and folds the
   digest into its working context before routing. Keep the addition tight —
   one bullet in the discipline section, not a new section.
2. **Intake playbook** (`docs/playbooks/intake.md`): a short "memory recall"
   step — when drafting a plan, check recalled entries for client/style facts
   and known failure modes; cite the entry slug when one changes a decision.
3. **Recall output budget:** `recall` prints index lines (name + description)
   by default, `--full` for bodies; cap default output (~50 lines) so intake
   context stays lean. Documented in the verb help.
4. **Docs:** `docs/cli-surface` regen; a short concept section in
   `docs/agent-guide.md` (tiers, proposal flow, recall discipline).

## Scope / acceptance

1. AGENTS.md + intake playbook edits pass `lint:agents-md` +
   `lint:docs-links:fast`.
2. Recall default vs `--full` behavior covered by a unit test (budget cap,
   workspace-overrides-global ordering).
3. English-only; regenerated surface docs committed in the same change.

## Notes

- Sequence after #112. Independent of #113 (recall reads active entries
  regardless of how they were ingested).
- Injection hygiene (hermes-agent pattern, 2026-06-11): the AGENTS.md /
  intake wording must frame recalled entries as background reference data,
  NOT instructions — entries reflect what was true when written; verify a
  named file/verb/model still exists before acting on it. Hermes wraps
  recalled context in a fenced block with exactly this system note.
- Cross-cutting file (AGENTS.md) — single coordinated edit, never parallel
  with another agent touching it.
