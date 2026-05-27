---
id: 10.05.01
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.05 OTLP export"
title: "ralphy export <backend> [--target <url>] [--since 7d]"
---

# 10.05.01 — `ralphy export <backend> [--target <url>] [--since 7d]`

**v1.0:** yes

**Acceptance criteria:**
- Backends: `langfuse`, `phoenix`, `otel` (generic OTLP HTTP).
- Reads `generations.jsonl`, transforms to OTLP traces / spans, posts.
- Idempotent — re-export of the same window is safe (uses `span_id` for dedup).
- No prompt/response bodies sent unless `--include-bodies` is set (and a warning printed).
