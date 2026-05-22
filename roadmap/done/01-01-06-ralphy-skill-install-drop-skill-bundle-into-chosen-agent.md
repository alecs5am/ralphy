---
id: 01.01.06
status: done
v1_0: yes
category: 01-cli
topic: "01.01 Front-stage verbs"
title: "ralphy skill install — drop skill bundle into chosen agent"
---

# 01.01.06 — `ralphy skill install` — drop skill bundle into chosen agent

**v1.0:** yes — per [D-05](../01-cli/OPEN-QUESTIONS.md#decision-log) scope is Claude / Cursor / Codex. All other agents move to `01.11.04`.

**Implementation:** [`cli/lib/skill/installer.ts`](../../cli/lib/skill/installer.ts) (3 adapters + sentinel-bounded merge), [`cli/commands/skill.ts`](../../cli/commands/skill.ts) (CLI wrapper). Idempotent across re-runs (sentinel block content replaces, never duplicates). `--agent windsurf` returns `E_AGENT_UNSUPPORTED` with pointer to `01.11.04`. `uninstallSkill()` strips the sentinel block. Tests: [`tests/unit/skill-installer.test.ts`](../../tests/unit/skill-installer.test.ts) (12 unit), [`tests/integration/cli-skill.test.ts`](../../tests/integration/cli-skill.test.ts) (3 integration).

**Acceptance criteria:**
- `ralphy skill install` auto-detects installed agents and installs the bundle. v1.0 `--agent <id>` allow-list: `claude`, `cursor`, `codex` (any other value errors with `E_AGENT_UNSUPPORTED` + a pointer to `01.11.04`).
- **Claude adapter** — copies (default) or symlinks the bundle into `~/.claude/skills/ralphy/` (user scope) or `./.claude/skills/ralphy/` (project scope). Merges a Ralphy section into `~/.claude/CLAUDE.md` (user) or repo `CLAUDE.md` (project) inside `<!-- ralphy:start --> ... <!-- ralphy:end -->` sentinels so re-runs are idempotent.
- **Cursor adapter** — writes `.cursor/rules/ralphy.mdc` with the playbook routing block + one-line pointer to `<repo>/AGENTS.md` (sentinel-bounded; merge-safe).
- **Codex / generic adapter** — ensures `AGENTS.md` exists at the repo root (merges a Ralphy section under sentinels if a foreign `AGENTS.md` is present).
- `--scope user|project` controls Claude/Cursor target; Codex adapter is always project-scoped (`AGENTS.md` lives at repo root).
- `--symlink` (default for Claude when invoked from a repo checkout) vs. `--copy` (default for npm/brew binary installs without a source tree).
- Idempotent: re-running upgrades the link/copy without dupes; sentinel-bounded merges replace the inner content, never duplicate it.
- Uninstall: `ralphy skill uninstall [--agent <id>]` removes the link/copy + strips the sentinel block.

**Notes:** new module `cli/lib/skill/installer.ts`. Bundle contents owned by [`03 — Skills`](../03-skills/). Wider adapter set (Continue, Aider, Cline, GitHub Copilot rules, Windsurf, Zed) is tracked under `01.11.04`.
