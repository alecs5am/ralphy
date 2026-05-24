---
id: 05.06.02
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.06 Profile export / import"
title: "ralphy profile import <tarball> restores"
---

# 05.06.02 — `ralphy profile import <tarball>` restores

**v1.0:** yes

**Acceptance criteria:**
- Validates manifest, version-checks against current CLI.
- Additive: existing projects with conflicting ids fail loudly (no silent overwrite).
- `--rename-on-conflict` flag remaps ids.
- After import, `ralphy workspace reindex` is run automatically.
