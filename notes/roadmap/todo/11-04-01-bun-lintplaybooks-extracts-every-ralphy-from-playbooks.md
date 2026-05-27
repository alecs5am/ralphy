---
id: 11.04.01
status: todo
v1_0: yes
category: 11-testing-and-reliability
topic: "11.04 Playbook lint"
title: "bun lint:playbooks extracts every ralphy ... from playbooks"
---

# 11.04.01 — `bun lint:playbooks` extracts every `ralphy ...` from playbooks

**v1.0:** yes

**Acceptance criteria:**
- Greps `docs/playbooks/**/*.md`, `.agents/skills/**/SKILL.md`, `AGENTS.md` for `ralphy ` invocations.
- For each, parses the verb + flags and asserts they exist (`ralphy <verb> --help` exit 0, all flags appear in `--help` output).
- CI fails on a stale reference.
