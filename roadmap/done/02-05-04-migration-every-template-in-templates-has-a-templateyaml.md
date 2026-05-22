---
id: 02.05.04
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.05 `template.yaml` schema"
title: "Migration: every template in templates/ has a template.yaml"
---

# 02.05.04 — Migration: every template in `templates/` has a `template.yaml`

**v1.0:** yes

**Implementation (2026-05-20):** `scripts/migrate-templates-to-yaml.ts` walks `templates/<category>/<slug>/template.json` and emits a sibling `template.yaml` with `version: 1` plus the parsed fields (`id`, `kind`, `category`, `name`, `description`, `tags`, `requires.refs` from `requiresUserReference`). Run via `bun run templates:migrate`. 55 templates migrated. `template.json` files left in place for backward compatibility — loader prefers `.yaml` but falls back. Tests at `tests/unit/templates-migration.test.ts` assert (a) every template dir has a `template.yaml`, (b) every YAML parses through the loader, (c) no shipped slug trips the lint rule.

**Acceptance criteria:**
- One-time pass: 42 templates each get a hand-curated `template.yaml`.
- CI grep: every dir under `templates/<category>/` has a `template.yaml`.
