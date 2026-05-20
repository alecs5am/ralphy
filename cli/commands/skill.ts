// `ralphy skill <install|uninstall>` — drop the skill bundle into the
// user's chosen agent (01.01.06).
//
// v1.0 adapters: claude / cursor / codex (per D-05). Other agents land
// under 01.11.04 — invoking them returns E_AGENT_UNSUPPORTED.

import { Command } from "commander";
import path from "node:path";
import { existsSync } from "node:fs";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { installSkill, uninstallSkill, type AgentId } from "../lib/skill/installer.js";

const V1_AGENTS: AgentId[] = ["claude", "cursor", "codex"];

function isV1Agent(s: string): s is AgentId {
  return (V1_AGENTS as string[]).includes(s);
}

function detectAgents(): AgentId[] {
  // Heuristic auto-detect: presence of agent-specific config dirs.
  const home = process.env.HOME || "";
  const found: AgentId[] = [];
  if (existsSync(path.join(home, ".claude"))) found.push("claude");
  // Cursor stores per-project rules so user-scope detection is unreliable;
  // include it if any of the legacy/local markers are present.
  if (existsSync(path.join(home, ".cursor")) || existsSync(".cursor")) found.push("cursor");
  if (existsSync("AGENTS.md")) found.push("codex");
  return found;
}

function bundleDir(): string {
  // Repo-checkout layout: <repo>/.agents/skills/ralphy/ if present, else
  // the .claude/skills/ralphy/ symlink target. Falls back to the repo's
  // .agents/ folder.
  const candidates = [
    path.join(process.cwd(), ".agents", "skills", "ralphy"),
    path.join(process.cwd(), ".claude", "skills", "ralphy"),
    path.join(process.cwd(), ".agents", "skills"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback: empty dir we'll create on the fly. The Claude adapter still
  // writes the CLAUDE.md routing pointer, which is the load-bearing part.
  return path.join(process.cwd(), ".agents", "skills", "ralphy");
}

export function skillCmd(): Command {
  const cmd = new Command("skill").description("Manage Ralphy skill installs across AI agents");

  const installCmd = cmd
    .command("install")
    .description("Install the Ralphy skill bundle into the selected agent (claude / cursor / codex)")
    .option("--agent <id>", "Target agent (auto-detects when omitted): claude, cursor, codex")
    .option("--scope <s>", "user | project (default: user for claude/cursor, project for codex)")
    .option("--symlink", "Symlink the bundle instead of copying (default copy)")
    .option("--copy", "Force copy mode (default — opposite of --symlink)")
    .action((opts) => {
      const agent = (opts.agent as string | undefined) ?? null;
      const targets: AgentId[] = agent ? [agent as AgentId] : detectAgents();
      if (agent && !isV1Agent(agent)) {
        raiseError("E_AGENT_UNSUPPORTED", { agent });
      }
      if (targets.length === 0) {
        // No agents auto-detected; surface a helpful pointer.
        out({ installed: [], message: "no agents detected; pass --agent claude|cursor|codex explicitly" });
        return;
      }
      const mode = opts.symlink ? "symlink" : "copy";
      const installed: unknown[] = [];
      for (const t of targets) {
        if (!isV1Agent(t)) {
          raiseError("E_AGENT_UNSUPPORTED", { agent: t });
        }
        const defaultScope = t === "codex" ? "project" : "user";
        const scope = (opts.scope as "user" | "project" | undefined) ?? defaultScope;
        const r = installSkill({
          agent: t,
          scope,
          bundleDir: bundleDir(),
          mode,
        });
        installed.push(r);
      }
      out({ installed });
    });

  cmd
    .command("uninstall")
    .description("Remove the Ralphy skill bundle + sentinel block from the selected agent")
    .option("--agent <id>", "Target agent (default: all detected)")
    .option("--scope <s>", "user | project (default mirrors install)")
    .action((opts) => {
      const agent = (opts.agent as string | undefined) ?? null;
      const targets: AgentId[] = agent ? [agent as AgentId] : detectAgents();
      if (agent && !isV1Agent(agent)) {
        raiseError("E_AGENT_UNSUPPORTED", { agent });
      }
      const removed: unknown[] = [];
      for (const t of targets) {
        if (!isV1Agent(t)) continue;
        const defaultScope = t === "codex" ? "project" : "user";
        const scope = (opts.scope as "user" | "project" | undefined) ?? defaultScope;
        const r = uninstallSkill({ agent: t, scope });
        removed.push(r);
      }
      out({ removed });
    });

  installCmd.addHelpText(
    "after",
    `
Examples:
  ralphy skill install --agent claude
  ralphy skill install --agent cursor --scope project
  ralphy skill install --agent codex
`,
  );

  return cmd;
}
