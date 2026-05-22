---
id: 01.05.02
status: doing
v1_0: yes
category: 01-cli
topic: "01.05 Common flag vocabulary"
title: "--slot <slug> always identifies an asset slot"
---

# 01.05.02 — `--slot <slug>` always identifies an asset slot

**v1.0:** yes

**Acceptance criteria:**
- Every `generate` subcommand and any verb that writes per-scene assets accepts `--slot`.
- Slot format `^[a-z0-9-]+$` enforced uniformly with the same error code.
