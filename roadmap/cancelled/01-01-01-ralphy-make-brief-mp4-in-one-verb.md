---
id: 01.01.01
status: cancelled
v1_0: no
category: 01-cli
topic: "01.01 Front-stage verbs"
title: "ralphy make — brief → mp4 in one verb"
---

# 01.01.01 — `ralphy make` — brief → mp4 in one verb

**v1.0:** no

**Resolution (2026-05-19):** `ralphy make` was dropped per [D-01](../01-cli/OPEN-QUESTIONS.md#decision-log). The "brief → mp4" flow is now an agent responsibility: intake captures the brief, `project create` registers the project, the art-director / editor playbooks fill it, and `ralphy render <id>` produces the mp4. The `--batch` use case lands as part of `01.01.04` (`iterate`) and the producer playbook; the reference-required gate is enforced by the intake playbook + `01.04.x` invariants.
