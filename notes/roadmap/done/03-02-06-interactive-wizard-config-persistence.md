---
id: 03.02.06
status: done
v1_0: yes
category: 03-skills
topic: "03.02 Cross-agent installer"
title: "Interactive wizard + config persistence"
---

# 03.02.06 — Interactive wizard + config persistence

**v1.0:** yes — per [D-03](../03-skills/OPEN-QUESTIONS.md#decision-log).

**Implementation:** `cli/lib/skill/wizard.ts` (pure helpers — detection, scope defaulting, config persistence) + `cli/commands/skill.ts → runWizard()` (clack-driven TUI). First run on TTY launches the wizard; subsequent runs replay the persisted choice from `~/.ralphy/config.json` (`skill.installedAgents`, `skill.installScope`, `skill.installDevNamespace`, `skill.wizardCompletedAt`). `--reconfigure` re-launches. `--agent <id>` bypasses entirely. `--json` / piped on first run → `E_WIZARD_NEEDS_TTY`. Codex + Copilot forced to project scope.

**Acceptance criteria:**
- On the first `ralphy skill install` (and as a sub-step of `ralphy setup` per `01.04.02`), launch an interactive wizard:
  1. Detect installed agents by probing for `~/.claude/`, `~/.cursor/`, `~/.codex/`, repo-root `AGENTS.md`, `.github/copilot-instructions.md`.
  2. Multi-select prompt: "install Ralphy skill bundle for: [x] claude [x] cursor [ ] codex" (defaults to detected set, can be edited).
  3. Per agent where ambiguity exists, ask scope: "user (works in every project, recommended) or project (this checkout only)?" Default = `user`. Codex is forced project-scope (AGENTS.md is repo-root).
- Persist to `~/.ralphy/config.json`: `skill.installedAgents` (list of agent ids), `skill.installScope` (`user` | `project`), `skill.installDevNamespace` (`true` | `false`, default `false` — installs `ralphy-dev:*` only when explicitly opted in or auto-detected via `ugc-cli` checkout, per `03.01.04`), `skill.wizardCompletedAt` (timestamp). The wizard does NOT prompt for `--symlink` vs `--copy` — that's auto-detected per [D-01](../03-skills/OPEN-QUESTIONS.md#decision-log).
- Subsequent `ralphy skill install` runs read the config and reinstall non-interactively against the persisted target set.
- `ralphy skill install --reconfigure` re-launches the wizard. `--agent <id> --scope <s>` bypasses the wizard entirely (CI / power users).
- The wizard inherits the CLI's pretty/JSON contract — TTY = interactive; `--json` or piped = wizard refuses and errors with `E_WIZARD_NEEDS_TTY` + hint to pass explicit flags.

**Notes:** modelled on Remotion's `npx create-video@latest` "Say yes to install Skills" flow.
