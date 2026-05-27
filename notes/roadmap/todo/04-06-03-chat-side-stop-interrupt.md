---
id: 04.06.03
status: todo
v1_0: stretch
category: 04-user-flow-and-autonomy
topic: "04.06 Interrupt + resume"
title: "Chat-side \"stop\" interrupt"
---

# 04.06.03 — Chat-side "stop" interrupt

**v1.0:** stretch

**Acceptance criteria:**
- If the agent is running a long-running command and the user types "stop", the agent kills the subprocess and reports state.
- Implementation depends on the agent platform; documented as best-effort.
