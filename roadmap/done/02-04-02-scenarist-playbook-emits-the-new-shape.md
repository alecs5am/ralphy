---
id: 02.04.02
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.04 Structured `scenes[]` in scenario.json"
title: "Scenarist playbook emits the new shape"
---

# 02.04.02 — Scenarist playbook emits the new shape

**v1.0:** yes

**Implementation (2026-05-20):** `docs/playbooks/scenarist.md` now carries an "Output contract" section that documents the `ScenarioSchema` shape, the 12-gesture enum, and the `notes` escape-hatch discipline ("reserved for what the schema can't express — not a dumping ground"). The `ralphy project migrate-scenario` one-off verb is deferred to category 05 since no projects ship the v1 schema yet (clean migration window).

**Acceptance criteria:**
- `docs/playbooks/scenarist.md` updated with the schema as the output contract per [D-01](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log) — scenarist LLM uses Zod `response_format` to emit structured `Scene[]`; `notes` is reserved for nuance the enum/struct can't capture, not for prose dumping.
- Existing scenarios are migrated by `ralphy project migrate-scenario` (one-off verb, deprecates post-v1.0).
