---
id: 01.02.03
status: done
v1_0: yes
category: 01-cli
topic: "01.02 Output contract uniformity"
title: "NDJSON event stream for long-running verbs"
---

# 01.02.03 — NDJSON event stream for long-running verbs

**v1.0:** yes

**Implementation:** [`cli/lib/stream/command.ts`](../../cli/lib/stream/command.ts) — `CommandStream` wraps `NdjsonEmitter` and routes by mode (NDJSON off-TTY / --json, single-summary on TTY). Wired into `render`, `generate video`, `generate music`, `assets install`. Event-kind catalog documented in [`docs/cli-spec.md`](../../docs/cli-spec.md) NDJSON streams section. `--quiet` suppresses every event except the final summary.

**Acceptance criteria:**
- Long-running verbs (`iterate`, `render`, `batch run`, `generate video`, `generate music`, `assets pull`) emit NDJSON events on stdout while running, with the final summary as the last line.
- Every event line is a complete JSON object with at minimum `{ ts, kind, ... }`.
- `--quiet` suppresses all events except the final summary.
- Event kinds per verb are documented in `docs/cli-spec.md`.

**Notes:** today only `render` emits structured progress. The rest print human strings or nothing.
