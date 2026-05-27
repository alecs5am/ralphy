---
id: 11.04.03
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.04 Playbook lint"
title: "Lint is forgiving of inline examples"
---

# 11.04.03 — Lint is forgiving of inline examples

**v1.0:** yes

**Acceptance criteria:**
- Code fences clearly marked as "example output" (e.g., `bash` blocks following an `Example:` heading) can be excluded with a sentinel comment.
- Linter documents the override.
