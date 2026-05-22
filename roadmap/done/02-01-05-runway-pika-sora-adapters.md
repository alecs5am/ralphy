---
id: 02.01.05
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.01 Per-model prompt formula (secondary shaping layer)"
title: "Runway / Pika / Sora adapters"
---

# 02.01.05 — Runway / Pika / Sora adapters

**v1.0:** yes

**Implementation (2026-05-20):** Three adapter files in `cli/lib/providers/prompt-adapter/`: `runway.ts` (subject-first prose + trailing "Temporal consistency: identity locked across the clip." reminder), `pika.ts` (comma-delimited subject + action + setting + style + camera order), `sora.ts` (camera idiom → perspective rewrite: "bodycam perspective", "drone perspective", "selfie perspective"; tight noun-verb sentences). Plus bonus `seedance.ts` + `hailuo.ts` adapters for the OpenRouter video families our pipeline routes to. Documented at `docs/prompts/video/{runway,pika,sora}.md`.

**Acceptance criteria:**
- Runway Gen-4: split into `subjectReference[] + styleReference[] + motion prose`; respect `temporalConsistency` flag.
- Pika: `subject + action + setting + style + camera`.
- Sora: short, physics-rich nouns; camera-as-perspective syntax ("bodycam perspective").
- Each documented in `docs/prompts/video/<model>.md`.
