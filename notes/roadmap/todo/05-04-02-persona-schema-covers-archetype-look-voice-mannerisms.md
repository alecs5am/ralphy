---
id: 05.04.02
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.04 Brand & Persona as first-class"
title: "Persona schema covers archetype, look, voice, mannerisms"
---

# 05.04.02 — Persona schema covers archetype, look, voice, mannerisms

**v1.0:** yes

**Acceptance criteria:**
- `persona.json` schema includes: `archetype`, `age_range`, `look_descriptors[]`, `voice_id`, `accent`, `mannerisms[]`, `reference_image?`.
- `ralphy persona suggest --archetype <text>` returns 3 closest matches.
