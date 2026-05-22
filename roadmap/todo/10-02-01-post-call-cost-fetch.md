---
id: 10.02.01
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.02 Cost-from-OpenRouter"
title: "Post-call cost fetch"
---

# 10.02.01 — Post-call cost fetch

**v1.0:** yes

**Acceptance criteria:**
- Every completed OpenRouter call gets its `id` recorded.
- After the call, a follow-up `GET /api/v1/generation?id=<id>` fetches `total_cost`.
- That number is written to `cost.usd` with `cost.source: "openrouter"`.
- If the fetch fails or times out (>5s), fall back to local estimate with `cost.source: "local-estimate"`.
