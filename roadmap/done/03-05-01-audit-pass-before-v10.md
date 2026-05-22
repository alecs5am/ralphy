---
id: 03.05.01
status: done
v1_0: yes
category: 03-skills
topic: "03.05 AGENTS.md routing audit"
title: "Audit pass before v1.0"
---

# 03.05.01 — Audit pass before v1.0

**v1.0:** yes

**Implementation:** `scripts/lint-agents-md.ts` exports `parseRoutingTable()`, `scanForClaudeIsms()`, `lintAgentsMd()`. Wired into `bun run lint:agents-md`. Unit tests in `tests/unit/lint-agents-md.test.ts`. Live audit pass: 12 routing rows scanned, 0 errors — every row points at an existing playbook / SKILL.md; AGENTS.md and CLAUDE.md are both Claude-ism free; CLAUDE.md contains no routing rules absent from AGENTS.md.

**Acceptance criteria:**
- AGENTS.md is the **source of truth** for routing per [D-06](../03-skills/OPEN-QUESTIONS.md#decision-log); CLAUDE.md is a Claude-Code-specific consumer (`@`-imports AGENTS.md, may add Claude-flavored personal context but no routing rules).
- Every row in the AGENTS.md routing table points at an existing playbook.
- Every playbook listed has a matching SKILL.md.
- Every hard invariant referenced (#1..#13) is current.
- `bun run lint:agents-md` enforces: AGENTS.md has no Claude-isms (no `~/.claude/` paths, no `claude mcp add` references in the routing table); CLAUDE.md contains no routing rules not also present in AGENTS.md.
