---
id: 06.04.03
status: doing
v1_0: yes
category: 06-utilities
topic: "06.04 Probe verbs"
title: "ralphy video frame <input> --at <sec>"
---

# 06.04.03 — `ralphy video frame <input> --at <sec>`

**v1.0:** yes

**Acceptance criteria:**
- Extracts a single frame, writes PNG (or JPEG with `--format jpeg`).
- `--at <sec>` accepts decimal seconds or `HH:MM:SS.mmm`.
- `--count N --interval <sec>` extracts a sequence.
