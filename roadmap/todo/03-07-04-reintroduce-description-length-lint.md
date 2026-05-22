---
id: 03.07.04
status: todo
v1_0: no
category: 03-skills
topic: "03.07 Post-launch"
title: "Reintroduce description-length lint"
---

# 03.07.04 — Reintroduce description-length lint

**v1.0:** no — trigger condition only.

**Acceptance criteria:**
- Reopen when external contributors start adding skills and review-on-PR can't catch description drift, OR when a real "skill stopped triggering" bug is traced to an over-budget description.
- At that point, ship: lint script that walks `.agents/skills/*/SKILL.md`, parses frontmatter, flags description > 1536 chars; CI required check; one-line fix-it hint pointing at `docs/skills-format.md`.

**Notes:** parked per [D-04](../03-skills/OPEN-QUESTIONS.md#decision-log). Today (v0.x) the description guidance lives in the author guide only.
