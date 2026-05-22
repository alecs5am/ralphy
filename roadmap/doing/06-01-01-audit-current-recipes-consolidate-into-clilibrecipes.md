---
id: 06.01.01
status: doing
v1_0: yes
category: 06-utilities
topic: "06.01 ffmpeg recipe library"
title: "Audit current recipes, consolidate into cli/lib/recipes/"
---

# 06.01.01 — Audit current recipes, consolidate into `cli/lib/recipes/`

**v1.0:** yes

**Acceptance criteria:**
- New module structure: `cli/lib/recipes/{audio,video,probe}/<recipe>.ts`.
- Each recipe is one exported function with typed input/output + a JSON-schema'd CLI wrapper.
- Today's verbs (loudnorm, sidechain-duck, concat, extract-segment, burn-subs, tonemap-hdr, smart-crop) all migrated.
- CI grep: `ffmpeg` and `child_process` appear only inside `recipes/`.
