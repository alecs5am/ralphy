---
id: 08.08.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.08 `ralphy council` — multi-agent evaluation"
title: "Each agent receives FULL project context"
---

# 08.08.02 — Each agent receives FULL project context

**v1.0:** yes

**Acceptance criteria:**
- The agent prompt includes: scenario.json, brand.json, persona.json, template metadata (kind + category + intended tone), refs metadata, and the active rubric YAML.
- Critically: the prompt explicitly states the intended *register* / *genre* of the work ("this is a brainrot meme — extreme physics are *desired*, not a fault" / "this is a body-horror experimental short — visceral imagery is intentional").
- Pulled automatically from `template.yaml`'s `register` / `genre_tags` fields (cross-link [`02.06`](../02-prompts-and-templates/PRD.md)).
- Test: a body-horror project does NOT score "unrealistic" as a fault dimension; a corporate-explainer project DOES.
