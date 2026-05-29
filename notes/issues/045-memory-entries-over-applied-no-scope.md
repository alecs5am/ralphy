# Feedback memory entries over-applied; no "Does NOT apply to" line

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** docs

## Context

User memory entries get over-applied when their scope conditions are implicit. The auto-memory skill's body-structure rule does cover `**Why:**` and `**How to apply:**`, but does NOT require a `**Does NOT apply to:**` negative scope. Result: an entry like `feedback_seedance_rejects_realistic_people` fires on stylized/cartoon t2v use cases where it doesn't apply.

## What

- `skater-spiderverse-001`: workflow-fixes #4 + Finding B — agent was about to silently render seedance instead of using it because the privacy-filter memory fired on a stylized use case.
- `venom-bodywash-001`: workflow-fixes #4 — seedance privacy filter hit 4 photoreal anchors with no MODELS.md warning either.

## Why it matters

Memory entries are load-bearing. Over-application is worse than under-application because it silently steers the agent to the wrong model.

## Suggested fix

- Update auto-memory skill body-structure rule (in `~/.claude/CLAUDE.md` auto-memory section or wherever the structure is enforced): every feedback memory should have an explicit `**Does NOT apply to:**` line.
- Retrofit existing entries with negative scope:
  - `feedback_seedance_rejects_realistic_people` — does NOT apply to stylized/cartoon t2v.
  - `feedback_broadcast_realism_square` — does NOT apply to 9:16-native niches.
  - others identified in audit.
- Cross-link: MODELS.md `bytedance/seedance-2.0` row gets explicit privacy-filter warning (issue 026).

## Sources

- `workspace/projects/skater-spiderverse-001/postmortem/05-workflow-fixes.md` — #4, Finding B
- `workspace/projects/venom-bodywash-001/postmortem/05-workflow-fixes.md` — #4
- MEMORY: `feedback_seedance_rejects_realistic_people`
