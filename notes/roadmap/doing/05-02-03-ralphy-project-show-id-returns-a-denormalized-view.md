---
id: 05.02.03
status: doing
v1_0: yes
category: 05-project-resources
topic: "05.02 Canonical project shape"
title: "ralphy project show <id> returns a denormalized view"
---

# 05.02.03 — `ralphy project show <id>` returns a denormalized view

**v1.0:** yes

**Acceptance criteria:**
- One JSON object with: project meta, linked brand/persona, scenario summary, gen-log rollup (cost + per-stage counts), asset-manifest, render status.
- Pretty mode renders a one-screen dashboard.
- Today: partial — extend to include brand/persona/render status.
