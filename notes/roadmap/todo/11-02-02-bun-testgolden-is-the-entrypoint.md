---
id: 11.02.02
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.02 Golden renders"
title: "bun test:golden is the entrypoint"
---

# 11.02.02 — `bun test:golden` is the entrypoint

**v1.0:** yes

**Acceptance criteria:**
- Renders each template via `ralphy render <fixture>`.
- Asserts structural properties (not bit-exact — ffmpeg encoder drift).
- Failure output points at the assertion that diverged + the artifact path.
