---
id: 04.03.03
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.03 Ask as many real questions as needed; never ask for confirmation"
title: "Real questions are allowed and encouraged when needed"
---

# 04.03.03 — Real questions are allowed and encouraged when needed

**v1.0:** yes

**Acceptance criteria:**
- The agent may ask multiple questions in one turn when each unblocks a distinct decision (e.g., "Which product is the hero — pastry or coffee? And do you want the founder on camera or a stand-in archetype?").
- No artificial cap on question count.
- Each question must name a specific decision and offer one or two defaults the user can accept.

**Implementation:** Covered by the per-band intake protocol in `docs/playbooks/intake.md` (per D-01): the protocol caps at 5 questions per turn for legibility (NOT 1), demands each question name a specific decision, and demands each offer at least one default. "Ask (rare but real)" bucket explicitly licenses multi-question turns.
