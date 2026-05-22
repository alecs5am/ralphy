---
id: 02.08.03
status: done
v1_0: stretch
category: 02-prompts-and-templates
topic: "02.08 Hook / Body / CTA primitive"
title: "--vary cta / --vary persona"
---

# 02.08.03 — `--vary cta` / `--vary persona`

**v1.0:** stretch

**Implementation (2026-05-20):** Landed alongside 02.08.02 — `ralphy batch vary --axis <hook|body|cta|persona>` accepts all four axes via the shared `VARY_AXES` enum in `cli/lib/schemas/hook-body-cta.ts`. Suffix mapping per axis (`h`/`b`/`c`/`p`). Integration coverage in `tests/integration/cli-batch-vary.test.ts`.

**Acceptance criteria:**
- Same shape as `--vary hook` for the other axes.
