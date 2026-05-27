---
id: 06.02.02
status: todo
v1_0: yes
category: 06-utilities
topic: "06.02 Smart-crop"
title: "Fallback strategies and warnings"
---

# 06.02.02 — Fallback strategies and warnings

**v1.0:** yes

**Acceptance criteria:**
- If face tracker finds nothing for > 50% of frames, falls back to saliency.
- If saliency is flat, falls back to static center crop + warning event in NDJSON.
- Warning is also surfaced in `ralphy project log` for the run.
