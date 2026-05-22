---
id: 11.01.04
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.01 CLI verb JSON-shape tests"
title: "Tests use fixtures, not real APIs"
---

# 11.01.04 — Tests use fixtures, not real APIs

**v1.0:** yes

**Acceptance criteria:**
- `tests/fixtures/` has: a 3-project workspace, 5 ref files, sample `prompts.json`, sample `scenario.json`, a 1s mp4 (shared with [`06`](../06-utilities/)).
- Tests for `generate *` use `--dry-run` and assert the resolved request body — they do not call providers.
- Provider mocks live at `tests/mocks/openrouter.ts`, `tests/mocks/elevenlabs.ts`.
