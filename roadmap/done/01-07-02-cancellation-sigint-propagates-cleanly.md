---
id: 01.07.02
status: done
v1_0: yes
category: 01-cli
topic: "01.07 Streaming / progress (cross-cutting refinement)"
title: "Cancellation: SIGINT propagates cleanly"
---

# 01.07.02 — Cancellation: SIGINT propagates cleanly

**v1.0:** yes

**Implementation:** [`cli/lib/cancel.ts`](../../cli/lib/cancel.ts) — `CancellationToken` with `onCancel(listener)`, `throwIfCancelled()`. `installSigintHandler()` wires the global token to `SIGINT`; first hit flips the token, second hit hard-exits with 130. Top-level boundary in [`cli/index.ts`](../../cli/index.ts) catches `CancelledError` from `uncaughtException` / `unhandledRejection` and routes to `raiseError("E_CANCELLED")` → exit 130 via `classifyExitCode`. Tests: [`tests/unit/cancellation.test.ts`](../../tests/unit/cancellation.test.ts) (5 cases).

**Acceptance criteria:**
- Ctrl-C during a long-running verb cancels in-flight API calls (where the provider supports it), emits a `cancelled` event, and exits 130.
- Partial state is preserved (append-only files honored) — no truncation.
