// Skill-install wizard helpers (03.02.06).
//
// The clack-driven runtime in `cli/commands/skill.ts` consumes these pure
// functions for detection, scope defaulting, and config persistence so the
// wizard logic stays testable without spinning up a TUI.

import fs from "node:fs";
import path from "node:path";
import { configSet, readGlobalConfig } from "../global-config.js";
import type { AgentId, Scope } from "./installer.js";

export interface DetectedAgent {
  agent: AgentId;
  /** Filesystem path that triggered detection (rendered in the wizard). */
  evidence: string;
}

export interface DetectEnv {
  /** Override $HOME for tests. */
  homeDir?: string;
  /** Override $cwd-like root for tests. */
  projectRoot?: string;
}

/**
 * Probe for installed agents by looking for their well-known config paths.
 * Returns the list of agents the user clearly already runs locally. The
 * wizard pre-checks these in the multi-select.
 */
export function detectAgentsInEnv(env: DetectEnv = {}): DetectedAgent[] {
  const homeDir = env.homeDir ?? process.env.HOME ?? "";
  const projectRoot = env.projectRoot ?? process.cwd();
  const found: DetectedAgent[] = [];

  // Claude Code — ~/.claude/
  const claudeDir = path.join(homeDir, ".claude");
  if (homeDir && fs.existsSync(claudeDir)) {
    found.push({ agent: "claude", evidence: claudeDir });
  }

  // Cursor — ~/.cursor/ or repo-local .cursor/
  const cursorHome = path.join(homeDir, ".cursor");
  const cursorProj = path.join(projectRoot, ".cursor");
  if ((homeDir && fs.existsSync(cursorHome)) || fs.existsSync(cursorProj)) {
    found.push({
      agent: "cursor",
      evidence: fs.existsSync(cursorHome) ? cursorHome : cursorProj,
    });
  }

  // Codex / generic AGENTS.md — repo root
  const agentsMd = path.join(projectRoot, "AGENTS.md");
  if (fs.existsSync(agentsMd)) {
    found.push({ agent: "codex", evidence: agentsMd });
  }

  // GitHub Copilot — repo .github/copilot-instructions.md
  const copilot = path.join(projectRoot, ".github", "copilot-instructions.md");
  if (fs.existsSync(copilot)) {
    found.push({ agent: "copilot", evidence: copilot });
  }

  return found;
}

/**
 * Default scope per agent.
 *
 * Codex and Copilot are always project-scoped because their canonical files
 * (AGENTS.md, .github/copilot-instructions.md) live at the repo root. Claude
 * Code and Cursor default to user scope so the install carries across every
 * project on the machine — matches the wizard discipline in D-03.
 */
export function defaultScopeFor(agent: AgentId): Scope {
  if (agent === "codex" || agent === "copilot") return "project";
  return "user";
}

// ─── Config persistence ────────────────────────────────────────────────────

export interface InstallChoice {
  installedAgents: AgentId[];
  installScope: Scope;
  installDevNamespace: boolean;
}

/**
 * Persist the wizard's outcome to ~/.ralphy/config.json under `skill.*`.
 * Subsequent `ralphy skill install` runs read this and re-install
 * non-interactively against the same target set.
 */
export function persistInstallChoice(choice: InstallChoice): void {
  configSet("skill.installedAgents", choice.installedAgents);
  configSet("skill.installScope", choice.installScope);
  configSet("skill.installDevNamespace", choice.installDevNamespace);
  configSet("skill.wizardCompletedAt", new Date().toISOString());
}

/**
 * Load a prior wizard outcome from the global config. Returns null when the
 * wizard has never been completed on this machine — the caller is expected to
 * launch the wizard (or refuse with E_WIZARD_NEEDS_TTY in non-TTY contexts).
 */
export function loadInstallChoice(): InstallChoice | null {
  const cfg = readGlobalConfig() as {
    skill?: {
      installedAgents?: AgentId[];
      installScope?: Scope;
      installDevNamespace?: boolean;
      wizardCompletedAt?: string;
    };
  };
  if (!cfg.skill?.wizardCompletedAt) return null;
  const installedAgents = (cfg.skill.installedAgents ?? []) as AgentId[];
  const installScope = (cfg.skill.installScope ?? "user") as Scope;
  const installDevNamespace = Boolean(cfg.skill.installDevNamespace);
  return { installedAgents, installScope, installDevNamespace };
}
