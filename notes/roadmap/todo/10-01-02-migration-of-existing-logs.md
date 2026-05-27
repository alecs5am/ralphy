---
id: 10.01.02
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.01 `generations.jsonl` schema"
title: "Migration of existing logs"
---

# 10.01.02 — Migration of existing logs

**v1.0:** yes

**Acceptance criteria:**
- `ralphy workspace migrate-gen-log` rewrites historical gen-logs into the new shape (append-only — writes `generations.v2.jsonl` and leaves `generations.jsonl` intact).
- Idempotent.
