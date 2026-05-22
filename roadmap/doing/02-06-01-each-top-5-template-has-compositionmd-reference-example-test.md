---
id: 02.06.01
status: doing
v1_0: yes
category: 02-prompts-and-templates
topic: "02.06 TOP-5 template hardening"
title: "Each TOP-5 template has composition.md + reference example + tests"
---

# 02.06.01 — Each TOP-5 template has composition.md + reference example + tests

**v1.0:** yes

**Implementation (2026-05-20):** `composition.md` written for all five TOP-5 templates — `templates/creator-lifestyle/pov-first-person/composition.md`, `.../grwm/composition.md`, `.../storytime/composition.md`, `templates/b2b-saas/yap-talking-head/composition.md`, `templates/entertainment-viral/italian-brainrot/composition.md`. Reference mp4s point at the `ralphy-assets` companion repo via `ralphy assets pull-pool` paths (cheap-resolution variants pending — tracked under category 05). Golden render test wired in 11.02 stays the integration anchor.

**Acceptance criteria:**
- `composition.md` exists, current, and matches the actual scenes.
- A reference rendered mp4 exists at `templates/<cat>/<slug>/reference.mp4` (with cached cheap-resolution version).
- Golden render test wired in `11.02`.
