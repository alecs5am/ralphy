---
id: 09.03.01
status: done
v1_0: no
category: 09-distribution-and-release
topic: "09.03 macOS Gatekeeper / quarantine"
title: "Investigate Developer ID signing path"
---

# 09.03.01 — Investigate Developer ID signing path

**v1.0:** no

**Resolution (2026-05-20):** No Apple Developer ID cert for v1.0 per [D-01](../09-distribution-and-release/OPEN-QUESTIONS.md#decision-log). Brew + npm install paths bypass Gatekeeper; `install.sh` auto-removes quarantine (`09.03.02`). The remaining double-click-from-Finder edge case is covered by `09.03.03` docs. Revisit at v1.5 / v2.0 if support tickets show real Gatekeeper friction.
