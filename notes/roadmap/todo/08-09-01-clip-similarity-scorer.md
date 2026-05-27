---
id: 08.09.01
status: todo
v1_0: no
category: 08-quality-and-evaluation
topic: "08.09 Post-launch"
title: "CLIP-similarity scorer"
---

# 08.09.01 — CLIP-similarity scorer

**v1.0:** no

**Acceptance criteria:**
- `assertions/clip.ts` adds prompt↔frame CLIP cosine + cross-scene identity drift.
- Optional dep: requires ONNX runtime or a remote endpoint; no-op if not installed.
