---
id: 01.11.01
status: todo
v1_0: no
category: 01-cli
topic: "01.11 Post-launch (tracked here for visibility)"
title: "Shell completions (zsh / fish / bash)"
---

# 01.11.01 — Shell completions (zsh / fish / bash)

**v1.0:** no

**Acceptance criteria:**
- `ralphy completion <shell>` prints a completion script.
- `ralphy completion install <shell>` writes it into the user's rc file (or completion dir) idempotently.
- Completes verbs, resource names, project ids (from workspace registry), template slugs, model ids.
