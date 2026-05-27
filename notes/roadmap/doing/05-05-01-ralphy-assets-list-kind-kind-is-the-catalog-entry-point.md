---
id: 05.05.01
status: doing
v1_0: yes
category: 05-project-resources
topic: "05.05 Asset cache + companion repo pool integration"
title: "ralphy assets list --kind <kind> is the catalog entry-point"
---

# 05.05.01 — `ralphy assets list --kind <kind>` is the catalog entry-point

**v1.0:** yes

**Acceptance criteria:**
- Reads from the live manifest (24h cached at `workspace/.ralph/asset-cache/manifest.json`).
- Returns `[{ slug, kind, sha256, size, license, source_url, tags[] }]`.
- Pretty: grouped table by kind.
