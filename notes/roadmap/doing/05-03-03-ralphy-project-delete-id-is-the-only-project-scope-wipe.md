---
id: 05.03.03
status: doing
v1_0: yes
category: 05-project-resources
topic: "05.03 Append-only invariant enforced in code"
title: "ralphy project delete <id> is the only project-scope wipe"
---

# 05.03.03 — `ralphy project delete <id>` is the only project-scope wipe

**v1.0:** yes

**Acceptance criteria:**
- Requires `--confirm` flag or interactive Y/N (no auto-yes via `-y` without `--confirm` also set).
- Removes project dir, registry entry, asset-cache reverse-links — atomic.
- Pretty mode confirms list of artifacts about to disappear; JSON mode requires `--confirm`.
