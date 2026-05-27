---
id: 04.03.04
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.03 Ask as many real questions as needed; never ask for confirmation"
title: "Confirmation-shape audit"
---

# 04.03.04 — Confirmation-shape audit

**v1.0:** yes

**Acceptance criteria:**
- Playbooks reviewed for confirmation-shaped phrases ("I'll go ahead and...", "Shall I...", "Just to confirm..."). Removed when the request is unambiguous.
- Synthetic eval: 20 unambiguous utterances; agent must take at least one tool action and emit zero confirmation-shape questions. Agent may emit clarifying questions only when the eval marks the utterance as genuinely ambiguous.

**Implementation:** `scripts/lint-confirmation-shape.ts` scans `docs/playbooks/` + `.agents/skills/*/SKILL.md` for banned phrases (12 EN + 4 RU patterns); ignores fenced code blocks + `<!-- confirmation-shape-allow -->` markers. Wired into `package.json` as `lint:confirmation-shape`. 12 unit tests in `tests/unit/lint-confirmation-shape.test.ts`, including a "real-repo zero-findings" assertion that runs the lint over the actual playbook tree. One existing offender (`docs/playbooks/scenarist/quality-gate.md`) rewritten to an action statement.
