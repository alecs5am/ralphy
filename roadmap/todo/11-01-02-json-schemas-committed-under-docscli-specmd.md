---
id: 11.01.02
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.01 CLI verb JSON-shape tests"
title: "JSON schemas committed under docs/cli-spec.md"
---

# 11.01.02 — JSON schemas committed under `docs/cli-spec.md`

**v1.0:** yes

**Acceptance criteria:**
- Each verb's output schema written as a JSON Schema or Zod schema in `cli/lib/schemas/<verb>.ts`.
- Tests import the schema and assert.
- Schemas are also referenced from `docs/cli-spec.md` (generated or hand-cited).
