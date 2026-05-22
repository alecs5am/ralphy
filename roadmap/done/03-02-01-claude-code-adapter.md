---
id: 03.02.01
status: done
v1_0: yes
category: 03-skills
topic: "03.02 Cross-agent installer"
title: "Claude Code adapter"
---

# 03.02.01 — Claude Code adapter

**v1.0:** yes

**Implementation:** `cli/lib/skill/installer.ts → installClaude()`. Copies (default) or symlinks the bundle into `~/.claude/skills/ralphy/` (user scope) or `<projectRoot>/.claude/skills/ralphy/` (project). CLAUDE.md is sentinel-merged (`<!-- ralphy:start v=1 -->` / `<!-- ralphy:end -->`). Round-trip verified in `tests/unit/skill-installer.test.ts`.

**Acceptance criteria:**
- Default behavior: `--symlink` from `~/.claude/skills/ralphy/` → `<repo>/.agents/skills/`.
- `--copy` mode: hardcopy + sentinel file `.ralphy-installed` for clean uninstall.
- Round-trip test: install → invoke a skill in Claude Code → uninstall → no residue.
