---
id: 09.03.03
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.03 macOS Gatekeeper / quarantine"
title: "Documentation for \"I got a Gatekeeper warning\""
---

# 09.03.03 — Documentation for "I got a Gatekeeper warning"

**v1.0:** yes — canonical surface for the rare direct-download path per [D-01](../09-distribution-and-release/OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- A short troubleshooting page in mintlify with the exact `xattr -d com.apple.quarantine /usr/local/bin/ralphy` command + a screenshot of the Gatekeeper dialog.
- README "Trouble?" section has a one-paragraph callout for users who downloaded the binary archive directly (not via brew / npm / `install.sh`) and were blocked.
- Page also clarifies that brew / npm / `install.sh` paths never trigger Gatekeeper, so the workaround is only needed for direct GH Releases downloads.
