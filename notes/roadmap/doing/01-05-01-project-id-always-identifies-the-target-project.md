---
id: 01.05.01
status: doing
v1_0: yes
category: 01-cli
topic: "01.05 Common flag vocabulary"
title: "--project <id> always identifies the target project"
---

# 01.05.01 — `--project <id>` always identifies the target project

**v1.0:** yes

**Acceptance criteria:**
- Every verb that operates on a project accepts `--project <id>`.
- Same precedence everywhere: explicit `--project` > auto-detected from `cwd` > error.
- `--cwd <path>` is the auto-detection override; documented identically per verb.
