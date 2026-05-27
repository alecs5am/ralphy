---
id: 10.02.03
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.02 Cost-from-OpenRouter"
title: "--dry-run cost estimate uses the same path"
---

# 10.02.03 — `--dry-run` cost estimate uses the same path

**v1.0:** yes

**Acceptance criteria:**
- `ralphy generate ... --dry-run` returns the local estimate (since there's no id to fetch yet).
- Audit verifies estimates are within ±15% of actuals on a 50-call sample.

**Notes:**
- Concrete mismatch observed 2026-05-27 (connector smoke test): `generate video
  --model bytedance/seedance-2.0-fast --duration 4 --dry-run` estimated **$0.20**,
  but the real call billed **$0.56** (~64% off — well outside ±15%). Root cause:
  two cost sources disagree — `estimateVideoCostUsd()` in `../../cli/lib/or-catalog.ts`
  (used by `--dry-run`) vs `VIDEO_PRICE_PER_SEC` in `../../cli/lib/providers/openrouter.ts`
  (0.14/s, used by the real call). Unify on one table so dry-run and real call
  read the same per-second rate.
