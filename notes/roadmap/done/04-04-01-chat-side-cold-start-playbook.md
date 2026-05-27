---
id: 04.04.01
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.04 Cold-start integration"
title: "Chat-side cold-start playbook"
---

# 04.04.01 — Chat-side cold-start playbook

**v1.0:** yes

**Acceptance criteria:**
- When the agent receives a "make me a video about X" type utterance, it runs `ralphy template suggest "<utterance>"` and presents top-1 inline: "I'll use the **<template>** template (15s, ~$8). Confirm or pick another."
- One sentence, one default action, opt-out path.

**Implementation:** Cold-start protocol in `docs/playbooks/intake.md#cold-start-template-suggestion-040401--040403` — runs `template suggest` first, branches on `tier` (primary → announce-and-proceed, secondary → list top-3 + ask once, fallback → free-form mode). Producer playbook Hard rule #5 carries the same contract.
