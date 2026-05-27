# 10 — Cost & Telemetry — Open Questions & Decisions

## Open questions

### Q-01: OpenRouter cost fetch — synchronous or background?
**Context:** the `/api/v1/generation?id=...` follow-up adds a round trip per call. Sync slows every gen; background risks lost numbers on cancellation.
**Options:**
- A. Sync, with a 5s timeout → fall back to local estimate. Predictable, slight latency.
- B. Background fetch via a queue; write `cost.usd` retroactively. More complex.
- C. Sync but parallel with next pipeline stage (start fetch immediately after submission, await before logging).
**Blocking:** `10.02.01`.
**Owner:** user. Default lean: C.

### Q-02: Budget enforcement — at provider call or at planning?
**Context:** `ralphy make` plans N gens. Do we check budget once at plan time (cheap, may be wrong on rerun) or before every gen (correct, more checks)?
**Options:**
- A. Before every gen. Correct, slightly slower.
- B. At plan time + a soft check before each gen.
- C. Before every gen, but cache the rollup per session for ~5s to avoid hammering gen-log read.
**Blocking:** `10.03.02`.
**Owner:** user. Default lean: C.

### Q-03: Project budget overlay vs daily budget — which wins on conflict?
**Context:** project says $2, daily says $10. User runs a project costing $3.
**Options:**
- A. Project cap is the floor; daily is the ceiling. Project ≤ daily always wins.
- B. Whichever is tighter at the moment of the call.
- C. Multi-level cap: per-call (none), per-project, per-session, per-day — refuse if any is exceeded.
**Blocking:** `10.03.04`.
**Owner:** user. Default lean: C.

### Q-04: gen-log size management
**Context:** `generations.jsonl` can grow unbounded. At what point do we rotate?
**Options:**
- A. Never rotate during v1.0; document for v1.1.
- B. Rotate at 50MB → `generations.NN.jsonl` with a summary kept inline.
- C. Per-day file split (`generations-YYYY-MM-DD.jsonl`).
**Blocking:** future `10.07.x` work; not blocking v1.0.
**Owner:** user.

### Q-05: OTLP export — push vs file dump
**Context:** OTLP/HTTP push is the standard; a file dump (NDJSON of spans) is simpler.
**Options:**
- A. OTLP/HTTP push only. Standard.
- B. File dump only — let users push themselves with `otel-cli` or similar.
- C. Both — push by default, dump on `--to-file <path>`.
**Blocking:** `10.05.01`.
**Owner:** user. Default lean: C.

### Q-06: Include prompt/response bodies in export by default?
**Context:** prompts and responses can be sensitive (user-supplied text, generated content). Default off is safer; default on is more useful for a dashboard.
**Options:**
- A. Default off; `--include-bodies` opts in with a warning.
- B. Default on; `--strip-bodies` opts out.
- C. Default off, with prompt/response hashes always exported (so a downstream can lookup if it has its own copy).
**Blocking:** `10.05.01`.
**Owner:** user. Default lean: A.

### Q-07: ElevenLabs cost — subscription or per-call?
**Context:** EL charges per character against a subscription quota; there's no per-call USD price. We can estimate "USD per character" based on the user's tier.
**Options:**
- A. Estimate based on tier in config. Approximate.
- B. Track character usage only (no USD); expose remaining quota.
- C. Both — character usage + tier-based USD estimate.
**Blocking:** `10.02.04`.
**Owner:** user. Default lean: C.

---

## Decision log

*(empty — fill as questions resolve)*
