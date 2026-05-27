---
id: 05.01.02
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.01 Workspace registry"
title: "ralphy workspace status shows registry health"
---

# 05.01.02 — `ralphy workspace status` shows registry health

**v1.0:** yes

**Acceptance criteria:**
- Returns counts per resource type, last-activity, registry vs filesystem drift.
- Reports "orphan dirs" (filesystem entries not in registry) and "phantom entries" (registry entries with no filesystem backing).
