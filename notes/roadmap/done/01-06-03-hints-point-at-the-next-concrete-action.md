---
id: 01.06.03
status: done
v1_0: yes
category: 01-cli
topic: "01.06 Exit codes and error catalog"
title: "Hints point at the next concrete action"
---

# 01.06.03 — Hints point at the next concrete action

**v1.0:** yes

**Acceptance criteria:**
- Every error's `hint` either names a verb to run, a file to edit, or a doc to read. **[x]** — every catalog entry's `hint` field references a concrete next action.
- No hint is a paraphrase of the message; reviewer pass before v1.0. **[x]** — enforced by `tests/unit/errors-catalog.test.ts` ("hints never restate the message verbatim").
