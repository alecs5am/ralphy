---
id: 05.05.04
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.05 Asset cache + companion repo pool integration"
title: "Improvisation refusal when asset exists"
---

# 05.05.04 — Improvisation refusal when asset exists

**v1.0:** yes

**Acceptance criteria:**
- If a playbook is about to write a prompt naming a real-world entity (character, brand, footage) AND `ralphy assets list` returns a match for that kind, the playbook stops and prompts the user: "use the cataloged asset `<slug>` or override?".
- Override is logged as `stage: "no-pool-consent"` in `generations.jsonl`.
