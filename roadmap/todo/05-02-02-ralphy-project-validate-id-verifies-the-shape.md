---
id: 05.02.02
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.02 Canonical project shape"
title: "ralphy project validate <id> verifies the shape"
---

# 05.02.02 — `ralphy project validate <id>` verifies the shape

**v1.0:** yes

**Acceptance criteria:**
- Checks: required files present, JSONL files parseable, asset-manifest references files that exist, no overwrite of v1 by v2 (only additive versions).
- Output: `{ ok, issues: [{ severity, file, message, hint }] }`.
- Exit 0 if clean, exit 5 (quality-gate refusal) if any error.
