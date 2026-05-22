---
id: 02.03.04
status: done
v1_0: stretch
category: 02-prompts-and-templates
topic: "02.03 Cookbook expansion"
title: "Cookbook is exported as agent-readable JSON"
---

# 02.03.04 — Cookbook is exported as agent-readable JSON

**v1.0:** stretch

**Implementation (2026-05-20):** Landed earlier than expected — `ralphy prompts modes --kind <video|voice|music>` returns the cookbook mode list as JSON (`cli/commands/prompts.ts`). Build-time cookbook.json export per D-07 is still deferred; the runtime walk is fast enough that agents don't notice. Tests at `tests/integration/cli-prompts.test.ts`.

**Acceptance criteria:**
- `ralphy prompts modes --kind video --model kling` returns the cookbook entries as JSON.
- Agent can list modes and pick one without reading markdown.
