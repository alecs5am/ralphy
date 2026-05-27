---
id: 09.02.02
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.02 Channels — GH / brew / npm"
title: "Brew tap formula auto-updates"
---

# 09.02.02 — Brew tap formula auto-updates

**v1.0:** yes

**Acceptance criteria:**
- After GH Release succeeds, a workflow PRs `alecs5am/homebrew-tap` with bumped version + new sha256.
- PR is auto-merged on green checks (the formula passes `brew test`).
- `brew install alecs5am/tap/ralphy` works for the new version within 5 min of the PR merge.
