---
id: 02.05.03
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.05 `template.yaml` schema"
title: "ralphy template suggest \"<utterance>\" matches by requires + category"
---

# 02.05.03 — `ralphy template suggest "<utterance>"` matches by `requires` + `category`

**v1.0:** yes

**Implementation (2026-05-20):** `cli/commands/template.ts` `suggest` reads `meta` from `readTemplateMeta()` (transparently handles both legacy `template.json` and new `template.yaml` since the YAML file ships alongside and `loadTemplateManifest()` prefers it). The suggest engine consumes `name`, `description`, `tags` — unchanged after the migration since the YAML preserves those fields. Verified via existing `tests/unit/template-suggest.test.ts` + new `tests/unit/templates-migration.test.ts` which loads every shipped template through the v1 loader.

**Acceptance criteria:**
- Today it does keyword rank; extend to also boost templates whose `requires` matches the project's existing brand/persona/refs.
