---
id: 02.02.03
status: todo
v1_0: yes
category: 02-prompts-and-templates
topic: "02.02 Reference grammar"
title: "\"Super-original\" master shots auto-passed"
---

# 02.02.03 — "Super-original" master shots auto-passed

**v1.0:** yes

**Status (2026-05-20):** Schema + adapter support landed (Scene.refs is a flat string[] for v1.0 per D-02; adapters consume refs[]); the "auto-populate from workspace/projects/<id>/master/" behavior in `ralphy generate` is the remaining piece. Deferred to a follow-up branded under category 05 (project-resources) since the master/ directory convention is project-resource scope. The art-director discipline of locking refs is already documented in `[[feedback_super_original_refs]]`.

**Acceptance criteria:**
- Project-level master shots (under `workspace/projects/<id>/master/`) auto-populate the `--ref` list on every gen unless explicitly overridden.
- Implements the "Super-original refs" discipline — lock product + model master shots and pass via `--ref` on every gen to prevent identity drift between scenes.
- When the 3-slot grammar lands post-launch (`02.02.01`), this task auto-promotes: master/character.png → `--cref`, master/style.png → `--sref`, master/product.png → `--pref`.
