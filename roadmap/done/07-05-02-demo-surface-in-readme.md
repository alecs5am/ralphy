---
id: 07.05.02
status: done
v1_0: yes
category: 07-socials-and-docs
topic: "07.05 README rewrite"
title: "Demo surface in README"
---

# 07.05.02 — Demo surface in README

**v1.0:** yes — re-scoped per [D-02](../07-socials-and-docs/OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- README links to the landing showcase marquee (`/#showcase` or equivalent anchor on `ralphy.dev`) as the canonical "see what it makes" surface.
- README also embeds **one** rendered Ralphy mp4 (or its animated-gif preview, ≤ 5MB) selected from `landing/public/showcase/`, placed just under the install block.
- No new screencast recording is required for v1.0. The 60s install-to-ship screencast moves to `07.10.04` (post-launch) and unblocks once the front-stage verb surface is frozen.

**Notes:** the embedded asset must be one of the 11 outputs already shipping on the landing (commit `2e61cbb`) — no fresh render needed. Pick a 9:16 clip for the embed; GitHub renders portrait video reasonably in a `<video>` tag.
