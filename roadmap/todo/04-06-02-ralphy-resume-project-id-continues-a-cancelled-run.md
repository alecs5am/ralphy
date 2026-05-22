---
id: 04.06.02
status: todo
v1_0: no
category: 04-user-flow-and-autonomy
topic: "04.06 Interrupt + resume"
title: "ralphy resume <project-id> continues a cancelled run"
---

# 04.06.02 — `ralphy resume <project-id>` continues a cancelled run

**v1.0:** no — deferred per [D-02](../04-user-flow-and-autonomy/OPEN-QUESTIONS.md#decision-log). Reopen as `04.07.05` if soft-launch testers consistently lose context after Ctrl-C.

**Acceptance criteria:** (post-launch)
- Detects the last cancelled stage from the gen-log and resumes from the next step.
- Idempotent — re-running doesn't duplicate completed work.

**Notes:** v1.0 substitute — the user simply re-engages with the agent in chat ("ok, continuing with scene-04"); the agent reads gen-log + manifest to know what's already done.
