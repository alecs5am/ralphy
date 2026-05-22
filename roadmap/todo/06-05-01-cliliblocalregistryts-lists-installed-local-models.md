---
id: 06.05.01
status: todo
v1_0: stretch
category: 06-utilities
topic: "06.05 Local-model architecture (post-launch foundation)"
title: "cli/lib/local/registry.ts lists installed local models"
---

# 06.05.01 — `cli/lib/local/registry.ts` lists installed local models

**v1.0:** stretch

**Acceptance criteria:**
- Registry file: `~/.ralphy/local-models/registry.json`.
- Lists installed models with kind (`captioning`, `llm`, `embedding`), backend (`whisper.cpp`, `llama.cpp`), path, sha256.
- `ralphy local list` shows the table.
