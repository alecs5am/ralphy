---
id: 11.01.03
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.01 CLI verb JSON-shape tests"
title: "Every v1.0 verb has a test"
---

# 11.01.03 — Every v1.0 verb has a test

**v1.0:** yes

**Acceptance criteria:**
- A `lint:verb-coverage` script lists verbs in `cli/commands/` and compares to test files; CI fails on a verb with no test.
- Exempted verbs (interactive `setup` wizard, etc.) are explicitly listed in an allowlist.
