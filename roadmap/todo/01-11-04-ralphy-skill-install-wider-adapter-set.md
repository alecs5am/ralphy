---
id: 01.11.04
status: todo
v1_0: no
category: 01-cli
topic: "01.11 Post-launch (tracked here for visibility)"
title: "ralphy skill install — wider adapter set"
---

# 01.11.04 — `ralphy skill install` — wider adapter set

**v1.0:** no

**Acceptance criteria:**
- Adapters land for Continue, Aider, Cline, GitHub Copilot custom instructions, Windsurf, Zed AI — one per release pass.
- `--agent <id>` allow-list expands without breaking the v1.0 `claude` / `cursor` / `codex` flags (no rename).
- Each new adapter mirrors the sentinel-bounded merge + idempotency rules from `01.01.06`.

**Notes:** scope decided in [D-05](../01-cli/OPEN-QUESTIONS.md#decision-log). Open a new sub-task per agent when demand surfaces.
