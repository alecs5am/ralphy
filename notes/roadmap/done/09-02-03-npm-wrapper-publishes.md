---
id: 09.02.03
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.02 Channels — GH / brew / npm"
title: "npm wrapper publishes"
---

# 09.02.03 — npm wrapper publishes

**v1.0:** yes

**Acceptance criteria:**
- `npm/package.json` version bumps in lockstep with the root.
- `npm publish --access public` from CI with an org token.
- Postinstall script downloads the right binary from GH and stages it.
- `npm i -g @alecs5am/ralphy && ralphy --version` works.
