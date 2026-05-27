---
id: 05.05.02
status: doing
v1_0: yes
category: 05-project-resources
topic: "05.05 Asset cache + companion repo pool integration"
title: "ralphy assets pull-pool <kind>/<slug> --install <project>"
---

# 05.05.02 — `ralphy assets pull-pool <kind>/<slug> --install <project>`

**v1.0:** yes

**Acceptance criteria:**
- Downloads if absent (with sha256 verify), copies into `workspace/projects/<id>/assets/refs/`, appends a `user-assets.jsonl` entry.
- Idempotent on re-run (no duplicate manifest entries).
