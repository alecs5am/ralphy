---
id: 01.09.07
status: done
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "ralphy doctor reports install mode"
---

# 01.09.07 — `ralphy doctor` reports install mode

**v1.0:** yes

**Implementation:** [`detectInstallMode()`](../../cli/commands/doctor.ts) walks up from the running file looking for the developer-mode marker triple (`package.json` + `cli/index.ts` + `templates/`). Returns `{ mode: "binary" | "developer", repoRoot }`. The `doctor` JSON report now includes `ralphy.mode`, `ralphy.home`, `ralphy.repoRoot`, `ralphy.templatesSource`, `ralphy.remotionSource`. Tests: [`tests/unit/doctor-install-mode.test.ts`](../../tests/unit/doctor-install-mode.test.ts) (3 cases).

**Acceptance criteria:**
- Doctor shows: `mode: "binary"|"developer"`, the resolved `~/.ralphy/` path, whether templates are bundled or repo-resolved, whether Remotion is bundled or repo-resolved.
- Helps users + agents understand the runtime environment in one read.
