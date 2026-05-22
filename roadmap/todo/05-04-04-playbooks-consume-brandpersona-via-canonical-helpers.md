---
id: 05.04.04
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.04 Brand & Persona as first-class"
title: "Playbooks consume brand/persona via canonical helpers"
---

# 05.04.04 — Playbooks consume brand/persona via canonical helpers

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/project/context.ts` exports `getProjectContext(id)` returning `{ brand, persona, refs[], template? }`.
- Scenarist, art-director, editor playbooks call this helper instead of reading individual files.
- Tests assert the helper is called from each playbook entry-point.
