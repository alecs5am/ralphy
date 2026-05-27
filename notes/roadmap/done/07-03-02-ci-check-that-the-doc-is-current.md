---
id: 07.03.02
status: done
v1_0: yes
category: 07-socials-and-docs
topic: "07.03 Auto-generated CLI reference"
title: "CI check that the doc is current"
---

# 07.03.02 — CI check that the doc is current

**v1.0:** yes

**Acceptance criteria:**
- A required check regenerates and diffs against committed.
- Failure = "the docs are stale, run `bun run docs:cli`".
