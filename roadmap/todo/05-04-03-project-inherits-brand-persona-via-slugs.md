---
id: 05.04.03
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.04 Brand & Persona as first-class"
title: "Project inherits brand + persona via slugs"
---

# 05.04.03 — Project inherits brand + persona via slugs

**v1.0:** yes

**Acceptance criteria:**
- `ralphy project create --brand <slug> --persona <slug>` links by reference, not copy.
- `ralphy project show <id>` denormalizes brand + persona inline.
- Editing brand updates rendered prompts on next gen (no stale copies in `prompts.json`).
