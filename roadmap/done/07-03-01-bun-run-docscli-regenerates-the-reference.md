---
id: 07.03.01
status: done
v1_0: yes
category: 07-socials-and-docs
topic: "07.03 Auto-generated CLI reference"
title: "bun run docs:cli regenerates the reference"
---

# 07.03.01 — `bun run docs:cli` regenerates the reference

**v1.0:** yes

**Acceptance criteria:**
- Script walks `cli/commands/`, extracts each verb's help text + flag definitions, emits one `.mdx` per verb under `docs-mintlify/reference/`.
- **Page shape per [D-03](../07-socials-and-docs/OPEN-QUESTIONS.md#decision-log):** top section is a curated summary (verb signature + 3 flags marked `commonInRef: true` in the verb's flag definitions + 1 worked example from the verb's `examples:` array). Bottom section is a Mintlify `<Expandable>` block titled "Full reference" with every flag in a table (name, type, default, description) plus all examples. Generator picks the first 3 flags deterministically if no `commonInRef` annotations are present.
- Re-running is idempotent.
- Generated files have a header sentinel: "Auto-generated — edit `cli/commands/` instead."
