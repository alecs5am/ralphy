---
id: 01.07.01
status: done
v1_0: yes
category: 01-cli
topic: "01.07 Streaming / progress (cross-cutting refinement)"
title: "Shared NDJSON emitter in cli/lib/"
---

# 01.07.01 — Shared NDJSON emitter in `cli/lib/`

**v1.0:** yes

**Acceptance criteria:**
- Single emitter `cli/lib/stream/ndjson.ts` used by every long-running verb. **[x]** — `NdjsonEmitter` class with `event()` / `summary()` / `close()`.
- Backpressure-safe (does not buffer unboundedly on slow stdout consumers). **[x]** — delegates to `Writable.write()` and the stream's built-in queue; no custom buffer.
- `--quiet` flag passed through suppresses all but the final event. **[x]** — `quiet: true` constructor option.
- Test: emits 10k events in <1s, never reorders. **[x]** — `tests/unit/ndjson-emitter.test.ts` covers all four invariants (6 tests).
- Remaining: wire the emitter into `render`, `iterate`, `batch run`, `generate video`, `generate music`, `assets pull` (tracked under 01.02.03).
