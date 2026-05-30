---
id: 08.08.06
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.08 `ralphy council` — multi-agent evaluation"
title: "Council verb wraps and replaces ralphy eval"
---

# 08.08.06 — Council verb wraps and replaces `ralphy eval`

**v1.0:** yes

**Acceptance criteria:**
- `ralphy eval <project-id>` is kept as an alias for `ralphy council <project-id> --agents 1 --quick`.
- The `evaluator` skill is renamed to `ralph-council` and invokes the verb.
