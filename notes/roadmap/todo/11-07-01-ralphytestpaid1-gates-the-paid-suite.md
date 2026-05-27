---
id: 11.07.01
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.07 Paid-test gating"
title: "RALPHY_TEST_PAID=1 gates the paid suite"
---

# 11.07.01 — `RALPHY_TEST_PAID=1` gates the paid suite

**v1.0:** yes

**Acceptance criteria:**
- Tests that hit real OpenRouter / ElevenLabs are tagged `[paid]` in their describe block.
- Default `bun test` skips them with a "skipped — set RALPHY_TEST_PAID=1" message.
- A separate workflow runs them on a schedule (nightly or on `main` push) using maintainer secrets.
