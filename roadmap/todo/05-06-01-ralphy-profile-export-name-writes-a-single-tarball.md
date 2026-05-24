---
id: 05.06.01
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.06 Profile export / import"
title: "ralphy profile export <name> writes a single tarball"
---

# 05.06.01 — `ralphy profile export <name>` writes a single tarball

**v1.0:** yes

**Acceptance criteria:**
- Output: `profiles/<name>.tar.zst` containing projects/, brands/, personas/, refs/, registry.json. No secrets, no asset cache.
- Manifest at the tarball root: `{ ralphy_version, exported_at, contents: {...} }`.
- Compression: zstd level 9. Single file < 100 MB for a 50-project workspace.
