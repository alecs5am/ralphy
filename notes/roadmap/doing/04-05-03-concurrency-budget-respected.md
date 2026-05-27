---
id: 04.05.03
status: doing
v1_0: stretch
category: 04-user-flow-and-autonomy
topic: "04.05 Producer mode"
title: "Concurrency budget respected"
---

# 04.05.03 — Concurrency budget respected

**v1.0:** stretch — concurrency caps are still relevant for single-project work that fans out (e.g., generating 10 image variants in parallel for one scene), but the batch-spawn use case is deferred.

**Acceptance criteria:**
- ElevenLabs concurrency cap 3; OpenRouter concurrent jobs auto-tuned.
- Cross-link with [`docs/perf-targets.md`](../../docs/perf-targets.md).
