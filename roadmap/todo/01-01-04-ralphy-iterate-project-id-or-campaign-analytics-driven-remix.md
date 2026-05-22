---
id: 01.01.04
status: todo
v1_0: stretch
category: 01-cli
topic: "01.01 Front-stage verbs"
title: "ralphy iterate <project-id-or-campaign> — analytics-driven remix"
---

# 01.01.04 — `ralphy iterate <project-id-or-campaign>` — analytics-driven remix

**v1.0:** stretch

**Acceptance criteria:**
- `ralphy iterate <project-id> --source <csv-or-api>` reads view/CTR/watch-time data, ranks variants, archives losers (per `--retire <expr>`), and queues `--remix <n>` new variants from winners.
- CSV path works for v1.0. TikTok Business API / Meta API are stretch (post-launch).
- Outputs `{ retired: [...], remixed: [...], next_actions: [...] }`.

**Notes:** new module `cli/lib/iterate/`. Marked stretch because the loop is post-launch nice-to-have, but the verb shape and CSV reader should land for v1.0 to lock the contract.
