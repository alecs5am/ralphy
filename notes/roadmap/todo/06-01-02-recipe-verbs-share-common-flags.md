---
id: 06.01.02
status: todo
v1_0: yes
category: 06-utilities
topic: "06.01 ffmpeg recipe library"
title: "Recipe verbs share common flags"
---

# 06.01.02 — Recipe verbs share common flags

**v1.0:** yes

**Acceptance criteria:**
- Standard flag set per recipe: `--input <path>`, `--output <path>` (or `--in-place`), `--project <id>` (optional, infers paths), `--dry-run`.
- `--dry-run` prints the resolved ffmpeg command without executing.
- Same precedence everywhere: explicit `--input` > `--project` inference > error.
