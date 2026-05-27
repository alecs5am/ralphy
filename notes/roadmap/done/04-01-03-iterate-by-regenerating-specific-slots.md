---
id: 04.01.03
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.01 Chat-driven draft → iterate → ship loop"
title: "Iterate by regenerating specific slots"
---

# 04.01.03 — Iterate by regenerating specific slots

**v1.0:** yes

**Acceptance criteria:**
- "Rework scene 3" → agent runs `ralphy generate <type> --slot scene-03-...` against the existing project; append-only versioning (`05.03.02`) writes `scene-03-anchor.v2.png`, etc., preserving the prior version.
- Re-render (`ralphy render <project-id>`) reuses the rest of the scene assets via the asset manifest; only the changed slots' versions are repointed.
- Wall time for "rework one scene + re-render": ≤ 90s for a 15s video.

**Implementation:** Append-only versioning landed in `cli/lib/providers/media.ts` per `05.03.02` (commit 753d2f7). Pattern documented in `docs/playbooks/art-director.md` "Hard rules" #5 + CLI cookbook "Single-slot regen" example.
