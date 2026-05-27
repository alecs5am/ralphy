---
id: 04.01.04
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.01 Chat-driven draft → iterate → ship loop"
title: "Ship = render + quality gates"
---

# 04.01.04 — Ship = render + quality gates

**v1.0:** yes

**Acceptance criteria:**
- "Ship it" maps to: agent runs quality gates (`08`) → if green, runs `ralphy render <project-id>` → produces `render/final.mp4` → reports to the user.
- Quality gates refuse-not-warn per [D-03](../04-user-flow-and-autonomy/OPEN-QUESTIONS.md#decision-log) + AGENTS invariant #4.
- Reference-required gate fires here (`04.02`).
- No model upgrade between iteration and ship — the same best models are used throughout (per `04.0A.03`).

**Implementation:** Five-step ship protocol documented in `docs/playbooks/intake.md#ship-040104` (ref-required re-check → preflight → quality gates → render → eval → user-authorized commit). Quality-gate refusal contract lives in `cli/lib/errors/catalog.ts` (`E_GATE_SCENARIO`/`_IMAGE`/`_VIDEO`).
