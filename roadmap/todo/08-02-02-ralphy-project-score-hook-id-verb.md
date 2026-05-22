---
id: 08.02.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.02 Hook scorer"
title: "ralphy project score-hook <id> verb"
---

# 08.02.02 — `ralphy project score-hook <id>` verb

**v1.0:** yes

**Acceptance criteria:**
- Standalone verb that runs the hook scorer on an existing render.
- Output: full Verdict + a `next_action` hint if failed (e.g., "rewrite hook" / "speed up cold open / add visual interrupt").
