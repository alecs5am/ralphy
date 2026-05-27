---
id: 05.06.03
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.06 Profile export / import"
title: "Round-trip preserves bit-exact state"
---

# 05.06.03 — Round-trip preserves bit-exact state

**v1.0:** yes

**Acceptance criteria:**
- Export → wipe → import → `diff -r` shows zero changes.
- Smoke test in CI on a 3-project fixture.
