---
id: 05.03.01
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.03 Append-only invariant enforced in code"
title: "CLI layer refuses non-consented deletes"
---

# 05.03.01 — CLI layer refuses non-consented deletes

**v1.0:** yes

**Acceptance criteria:**
- Any path under `workspace/projects/<id>/{assets,render,logs,postmortem}/` or any project-root `.json` / `.md` is **read-only by default** at the CLI library boundary (`cli/lib/fs/safe.ts` new module).
- Mutation requires explicit `consent_kind`: `"new-version"`, `"new-file"`, `"append"`, or `"user-explicit-delete"`. Anything else throws.
- Tests cover every kind.
