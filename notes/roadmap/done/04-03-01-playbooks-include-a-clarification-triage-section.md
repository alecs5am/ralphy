---
id: 04.03.01
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.03 Ask as many real questions as needed; never ask for confirmation"
title: "Playbooks include a \"clarification triage\" section"
---

# 04.03.01 — Playbooks include a "clarification triage" section

**v1.0:** yes

**Acceptance criteria:**
- Each playbook lists: information the agent should infer (most cases), information the agent should ask about (rare but real cases), and information the agent should fail loudly on if missing.
- "Should I proceed?", "Shall I go ahead?", "Would you like me to..." — these patterns are explicitly forbidden when the request is concrete and the agent has a defensible default.

**Implementation:** Clarification-triage section in `docs/playbooks/intake.md` (3-bucket triage: infer / ask / fail-loudly) is the canonical reference; per-band intake (per D-01) layers on top. Other role playbooks reference it via their "Hard rules" handoff.
