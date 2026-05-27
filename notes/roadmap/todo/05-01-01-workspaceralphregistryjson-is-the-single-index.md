---
id: 05.01.01
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.01 Workspace registry"
title: "workspace/.ralph/registry.json is the single index"
---

# 05.01.01 — `workspace/.ralph/registry.json` is the single index

**v1.0:** yes

**Acceptance criteria:**
- File schema: `{ projects: [{id, dir, brand?, persona?, last_activity_ts, status, cost_usd}], brands: [...], personas: [...], refs: [...], templates: [...] }`.
- Every CRUD operation through `ralphy <resource> create|delete` updates the registry atomically (write-temp + rename).
- Registry is rebuildable from filesystem via `ralphy workspace reindex` — idempotent.
- File-locked on writes; concurrent CLI invocations are safe.
