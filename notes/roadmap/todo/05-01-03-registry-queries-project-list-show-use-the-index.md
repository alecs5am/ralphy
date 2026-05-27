---
id: 05.01.03
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.01 Workspace registry"
title: "Registry queries (project list / show) use the index"
---

# 05.01.03 — Registry queries (project list / show) use the index

**v1.0:** yes

**Acceptance criteria:**
- `ralphy project list` reads from registry only — no filesystem scan in the hot path.
- `ralphy project list --filter "brand=acme"` works.
- Sort flags: `--sort last_activity|cost|name|status`.
