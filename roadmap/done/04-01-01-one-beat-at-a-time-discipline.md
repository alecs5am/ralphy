---
id: 04.01.01
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.01 Chat-driven draft → iterate → ship loop"
title: "One-beat-at-a-time discipline"
---

# 04.01.01 — One-beat-at-a-time discipline

**v1.0:** yes

**Acceptance criteria:**
- After intake (`intake.md` steps 1-2 — clarifying questions + plan approval), the agent generates ONE representative beat first — usually the location-master-plate or scene-01 anchor — and surfaces it before fanning out to the rest.
- Only after the user says "good" / "let's go" / equivalent does the agent batch the remaining scenes (in groups of 4-6 with checkpoints, never the whole set blind).
- Always uses the best model per kind (`MODELS.md` top picks) — no "cheaper draft model" path. Discipline = scope reduction, not model swap.
- Implementation: encoded in `intake.md` step 3 (already written); no new CLI mode is added.

**Implementation:** `docs/playbooks/intake.md` step 3 ("Step-by-step generation with checkpoints") + the location-master-plate rule in `docs/playbooks/art-director.md` "Anchor order discipline" block.
