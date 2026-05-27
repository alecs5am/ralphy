---
id: 03.01.01
status: doing
v1_0: yes
category: 03-skills
topic: "03.01 agentskills.io compliance"
title: "Frontmatter contract"
---

# 03.01.01 — Frontmatter contract

**v1.0:** yes

**Acceptance criteria:**
- Every SKILL.md has `name` (kebab-case slug matching folder), `description` (one paragraph, ≤ 1536 chars).
- Optional: `when_to_use`, `allowed-tools`, `disable-model-invocation`, `paths`, `context`, `argument-hint`, `arguments`.
- Lint: `bun run lint:skills` parses frontmatter, validates schema, errors on missing required fields.
