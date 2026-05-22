---
id: 01.09.04
status: todo
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "Remotion compositions bundled, materialized on render"
---

# 01.09.04 — Remotion compositions bundled, materialized on render

**v1.0:** yes

**Acceptance criteria:**
- `src/lib/` Remotion components are embedded in the binary as a tarball asset.
- On `ralphy render <id>`, the needed composition is materialized to `~/.ralphy/render-cache/<id>/` and Remotion runs against it.
- Cache is invalidated on `ralphy upgrade` (new version → new bundled compositions).
- A repo-clone install uses the on-disk `src/` directly (developer mode), detected via presence of `package.json`.
