---
id: 05.05.03
status: doing
v1_0: yes
category: 05-project-resources
topic: "05.05 Asset cache + companion repo pool integration"
title: "docs/assets-catalog.md regenerates from manifest"
---

# 05.05.03 — `docs/assets-catalog.md` regenerates from manifest

**v1.0:** yes

**Acceptance criteria:**
- `ralphy assets catalog --write` regenerates the markdown.
- CI check: catalog file matches the regenerated output (no manual drift).
