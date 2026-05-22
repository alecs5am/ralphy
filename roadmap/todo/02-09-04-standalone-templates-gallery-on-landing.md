---
id: 02.09.04
status: todo
v1_0: no
category: 02-prompts-and-templates
topic: "02.09 Post-launch"
title: "Standalone /templates gallery on landing"
---

# 02.09.04 — Standalone `/templates` gallery on landing

**v1.0:** no — reopens per [D-04](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log) when catalog growth exceeds what hand-curated showcase content can represent.

**Acceptance criteria:** (post-launch — mirrors original `02.07.01` / `02.07.02`)
- `landing/app/templates/page.tsx` lists every template with name, category, one-line description, estimated cost, "try it" snippet.
- `landing/app/templates/[slug]/page.tsx` shows composition + reference render embed + CLI snippet + link to GitHub source.
- Data comes from `templates/*/template.yaml` at build time (static, per [D-04](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log)).
- Trigger condition: ≥ 60 templates in `templates/` OR explicit tester feedback that the showcase doesn't surface what they want to try.
