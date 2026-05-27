---
id: 10.01.03
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.01 `generations.jsonl` schema"
title: "Writers across the codebase use the schema"
---

# 10.01.03 — Writers across the codebase use the schema

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/log/append.ts` validates every write against the Zod schema before append.
- Failing validation throws (the caller should never write a malformed line).
