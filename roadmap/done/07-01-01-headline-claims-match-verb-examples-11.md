---
id: 07.01.01
status: done
v1_0: yes
category: 07-socials-and-docs
topic: "07.01 Landing copy ↔ CLI alignment"
title: "Headline claims match verb examples 1:1"
---

# 07.01.01 — Headline claims match verb examples 1:1

**v1.0:** yes

**Acceptance criteria:**
- Every claim string in `landing/components/Hero.tsx` and `landing/components/sections/HowItWorks.tsx` appears verbatim in some `ralphy <verb> --help` `Examples:` block.
- CI grep enforces (cross-link `01.03.02`).
