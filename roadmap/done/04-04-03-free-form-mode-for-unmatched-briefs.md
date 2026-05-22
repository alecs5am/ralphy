---
id: 04.04.03
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.04 Cold-start integration"
title: "\"Free-form\" mode for unmatched briefs"
---

# 04.04.03 — "Free-form" mode for unmatched briefs

**v1.0:** yes

**Acceptance criteria:**
- If `template suggest` scores < 0.5 confidence on the top result, the agent enters scenarist-from-scratch mode (per `docs/playbooks/scenarist.md`).
- Announces the mode shift: "No close template match — drafting from scratch."

**Implementation:** `ralphy template suggest` already emits a `tier` field (`primary | secondary | fallback`) via `cli/lib/templater/suggest.ts`; the threshold defaults to 0.7 and the `--threshold <n>` flag exposes it. The `fallback` tier is the documented trigger for free-form mode in `docs/playbooks/intake.md` cold-start step 2c. Announcement language documented verbatim in the same section.
