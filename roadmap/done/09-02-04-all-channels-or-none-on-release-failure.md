---
id: 09.02.04
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.02 Channels — GH / brew / npm"
title: "All-channels-or-none on release failure"
---

# 09.02.04 — All-channels-or-none on release failure

**v1.0:** yes

**Acceptance criteria:**
- If any channel publish fails, `/release` reports which channel succeeded and which failed.
- A "delist" verb (`ralphy release delist <version>`) marks a release as unstable on GH and pulls the brew + npm bumps.
- Documented rollback in `docs/release-runbook.md`.
