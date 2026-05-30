---
id: 09.04.03
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.04 `/release` skill polish"
title: "Skill never amends a published release"
---

# 09.04.03 — Skill never amends a published release

**v1.0:** yes

**Acceptance criteria:**
- Documented invariant in `.claude/skills/dev-release/SKILL.md`.
- Re-running on an already-cut version errors with `E_RELEASE_IMMUTABLE`.
