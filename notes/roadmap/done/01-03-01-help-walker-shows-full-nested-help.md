---
id: 01.03.01
status: done
v1_0: yes
category: 01-cli
topic: "01.03 Help system depth"
title: "--help walker shows full nested help"
---

# 01.03.01 — `--help` walker shows full nested help

**v1.0:** yes

**Acceptance criteria:**
- `ralphy <resource> --help` lists actions; `ralphy <resource> <action> --help` lists flags. Walker handles arbitrary depth.
- Already implemented in commit `7241f37`.

**Notes:** landed. Keep an eye on regressions when adding new verbs.
