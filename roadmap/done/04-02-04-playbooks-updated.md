---
id: 04.02.04
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.02 Industry-aware default; ref only when truly required"
title: "Playbooks updated"
---

# 04.02.04 — Playbooks updated

**v1.0:** yes

**Acceptance criteria:**
- `docs/playbooks/art-director.md` and `docs/playbooks/producer.md` reflect the new gate semantics.
- AGENTS.md invariant #3 reworded: "Reference gate fires only for named real entities the model cannot fabricate (specific persons, recognizable brand products, IP). Generic product/lifestyle work proceeds without refs."

**Implementation:** Updated `AGENTS.md` invariant #3 (named real entities only + `--no-ref-consent` + floor command). `docs/playbooks/art-director.md` Hard rules #2 + #5 rewritten. `docs/playbooks/art-director/ref-photo-policy.md` head + step-3 consent path rewritten. `docs/playbooks/producer.md` Hard rules #6 + #7 added. `docs/playbooks/intake.md` step 1.3 rewritten.
