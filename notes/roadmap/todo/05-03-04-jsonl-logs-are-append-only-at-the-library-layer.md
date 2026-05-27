---
id: 05.03.04
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.03 Append-only invariant enforced in code"
title: "JSONL logs are append-only at the library layer"
---

# 05.03.04 — JSONL logs are append-only at the library layer

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/log/append.ts` is the only writer for `generations.jsonl`, `user-prompts.jsonl`, `user-assets.jsonl`.
- It only supports `append`. Truncation throws.
- Rotation / archival is post-launch (`05.07.x`).
