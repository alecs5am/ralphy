---
id: 11.02.03
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.02 Golden renders"
title: "Regenerating goldens is a single command"
---

# 11.02.03 — Regenerating goldens is a single command

**v1.0:** yes

**Acceptance criteria:**
- `bun test:golden --update` re-renders and writes new fixtures.
- Diff against git shows what changed — reviewer can sanity check.
