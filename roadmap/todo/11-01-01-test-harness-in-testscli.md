---
id: 11.01.01
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.01 CLI verb JSON-shape tests"
title: "Test harness in tests/cli/"
---

# 11.01.01 — Test harness in `tests/cli/`

**v1.0:** yes

**Acceptance criteria:**
- One test file per verb: `tests/cli/<verb>.test.ts`.
- Harness `tests/cli/_runner.ts` spawns `bun run ralph -- <args>`, captures stdout/stderr/exit, parses JSON.
- Vitest or `bun test` — pick one and use it consistently (see Q-01).
