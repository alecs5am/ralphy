---
id: 09.01.02
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.01 Install scripts"
title: "install.ps1 clean-machine smoke per release"
---

# 09.01.02 — `install.ps1` clean-machine smoke per release

**v1.0:** yes — PS1 is the only Windows install channel per [D-02](../09-distribution-and-release/OPEN-QUESTIONS.md#decision-log). No `.exe` installer or portable zip distribution.

**Acceptance criteria:**
- GitHub Actions Windows runner (windows-2022) runs `irm install.ps1 | iex` against a release candidate tag.
- Asserts: `ralphy --version` matches the tag, PATH set in current shell, persisted to user PATH, install completes in < 60s.
- Test PATH persistence by spawning a new PowerShell session and re-running `ralphy --version`.
- README + Mintlify document `irm install.ps1 | iex` as the canonical Windows install line — no zip download links in v1.0.
