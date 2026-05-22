---
id: 05.03.02
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.03 Append-only invariant enforced in code"
title: "ralphy generate writes new versions, never overwrites"
---

# 05.03.02 — `ralphy generate` writes new versions, never overwrites

**v1.0:** yes

**Acceptance criteria:**
- Existing slot file `scene-04-image.png` + new gen → writes `scene-04-image.v2.png`.
- Subsequent gens go `.v3`, `.v4`, …
- Asset manifest tracks all versions; latest is the "active" version unless explicitly promoted.
- `ralphy asset promote <project> <slot> <version>` sets which version the renderer uses.
