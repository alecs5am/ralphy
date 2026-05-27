---
id: 10.02.02
status: todo
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.02 Cost-from-OpenRouter"
title: "Local-estimate fallback uses MODELS.md pricing"
---

# 10.02.02 — Local-estimate fallback uses `MODELS.md` pricing

**v1.0:** yes

**Acceptance criteria:**
- Pricing table at `cli/lib/pricing/table.ts` derived from `MODELS.md`.
- `model_pricing_version` field tracks which version was used (e.g., `2026-05-08`).
- Documented as fallback only.
