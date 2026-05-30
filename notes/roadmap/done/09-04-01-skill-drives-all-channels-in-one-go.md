---
id: 09.04.01
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.04 `/release` skill polish"
title: "Skill drives all channels in one go"
---

# 09.04.01 — Skill drives all channels in one go

**v1.0:** yes

**Acceptance criteria:**
- `/release` (the skill at `.claude/skills/dev-release/SKILL.md`) walks: status → semver propose → changelog draft → version bumps → tag push → CI watch → brew bump verify → npm publish verify → final summary.
- Only manual step: approving the diff before tag push.
- All steps documented in the skill.
