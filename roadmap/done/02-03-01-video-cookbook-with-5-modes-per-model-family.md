---
id: 02.03.01
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.03 Cookbook expansion"
title: "Video cookbook with ≥ 5 modes per model family"
---

# 02.03.01 — Video cookbook with ≥ 5 modes per model family

**v1.0:** yes

**Implementation (2026-05-20):** `docs/prompts/video/{kling,veo,luma,pika,runway,sora}.md`. Each file has 5 mode blocks with use-case, formula, sample prompt, and "don't" pitfalls. Index at `docs/prompts/video/README.md`.

**Acceptance criteria:**
- `docs/prompts/video/{kling,veo,luma,pika,runway,sora}.md` exists.
- Each file has ≥ 5 mode blocks (e.g., for Kling: selfie-talking-head, POV-walking, hyper-motion, hand-product-reveal, jump-cut-meme).
- Each mode has: ideal use case, formula example, "do not" pitfalls, sample prompts.
