---
id: 04.03.02
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.03 Ask as many real questions as needed; never ask for confirmation"
title: "Default-pick rules for ambiguous requests"
---

# 04.03.02 — Default-pick rules for ambiguous requests

**v1.0:** yes

**Acceptance criteria:**
- "Make me a video about X" with no template specified → run `template suggest`, pick top-1, announce the pick (no confirmation needed).
- No persona specified → pick the brand's default persona; ask for archetype only if the brand has no default.
- No duration specified → default 15s.
- Documented in `docs/use-cases.md`.

**Implementation:** Default-pick table in `docs/playbooks/intake.md#default-pick-rules-040302` covers template / persona / duration / aspect / music / output language. Each row names the source-of-truth.
