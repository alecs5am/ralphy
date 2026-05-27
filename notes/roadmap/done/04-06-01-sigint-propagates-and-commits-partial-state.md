---
id: 04.06.01
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.06 Interrupt + resume"
title: "SIGINT propagates and commits partial state"
---

# 04.06.01 — SIGINT propagates and commits partial state

**v1.0:** yes

**Acceptance criteria:**
- Ctrl-C during any long-running verb emits a `cancelled` NDJSON event, kills in-flight provider calls if cancellable, and exits 130.
- Project state on disk is consistent: any partial gen is logged as `stage: "cancelled"` in `generations.jsonl`; no half-written files in `assets/`.
- Cross-link [`01.07.02`](../01-cli/PRD.md).

**Implementation:** Landed in `01.07.02`. `cli/lib/cancel.ts` exposes `CancelledError`, `CancellationToken`, and `installSigintHandler()`. `cli/index.ts` installs the handler at process start. The catalog code is `E_CANCELLED` (class `cancelled` → exit 130). Coverage in `tests/unit/cancellation.test.ts`.
