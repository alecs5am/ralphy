// Per-agent skill installer (01.01.06).
//
// Three adapters land in v1.0 per [D-05](roadmap/01-cli/OPEN-QUESTIONS.md):
//
//   • claude  — copy (default) or symlink the bundle into
//                ~/.claude/skills/ralphy/ (user scope) or
//                ./.claude/skills/ralphy/ (project scope), then sentinel-merge
//                a Ralphy routing pointer into CLAUDE.md.
//   • cursor  — write .cursor/rules/ralphy.mdc with the playbook routing
//                block and a pointer to <repo>/AGENTS.md.
//   • codex   — ensure AGENTS.md exists at the project root, sentinel-merge
//                the Ralphy section if a foreign AGENTS.md is already there.
//
// Wider adapter set (Continue, Aider, Cline, Copilot rules, Windsurf, Zed)
// is tracked under 01.11.04.

import fs from "node:fs";
import path from "node:path";

export const SENTINEL_START = "<!-- ralphy:start v=1 -->";
export const SENTINEL_END = "<!-- ralphy:end -->";

export type AgentId = "claude" | "cursor" | "codex" | "copilot";
export type Scope = "user" | "project";
export type InstallMode = "copy" | "symlink";

export interface InstallOptions {
  agent: AgentId;
  scope: Scope;
  bundleDir: string;
  homeDir?: string;       // override $HOME for tests / --home <path>
  projectRoot?: string;   // override $cwd for tests / --cwd-supplied root
  mode?: InstallMode;
}

export interface UninstallOptions {
  agent: AgentId;
  scope: Scope;
  homeDir?: string;
  projectRoot?: string;
}

export interface InstallResult {
  ok: true;
  agent: AgentId;
  scope: Scope;
  installed: string[];     // paths created or updated
}

// ─── Sentinel-bounded merge ────────────────────────────────────────────────

/**
 * Replace (or append) the sentinel-bounded block inside `input` with `body`.
 * Idempotent across re-runs — a second call swaps the inner content without
 * duplicating the block.
 */
export function sentinelMerge(input: string, body: string): string {
  const startIdx = input.indexOf(SENTINEL_START);
  const endIdx = input.indexOf(SENTINEL_END);
  const block = `${SENTINEL_START}\n${body}\n${SENTINEL_END}`;
  if (startIdx >= 0 && endIdx > startIdx) {
    // Replace inner block (including the sentinels themselves so a malformed
    // prior insert gets reset).
    return input.slice(0, startIdx) + block + input.slice(endIdx + SENTINEL_END.length);
  }
  // No sentinel found — append (with a separator newline if needed).
  const sep = input.length === 0 || input.endsWith("\n") ? "" : "\n";
  return input + sep + (input.length > 0 && !input.endsWith("\n\n") ? "\n" : "") + block + "\n";
}

function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function writeFile(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function removeRecursive(p: string): void {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

// ─── Routing pointer (the body of the sentinel block) ─────────────────────

const ROUTING_BLOCK = `# Ralphy

Use Ralphy CLI for every UGC generation step. Read <repo>/AGENTS.md before acting — it routes by user intent to the right playbook.

- ralphy doctor — verify env health
- ralphy new "<brief>" — start a project
- ralphy template suggest "<utterance>" — match a template
- ralphy render <id> — produce the mp4

Source-of-truth playbooks live under docs/playbooks/. The full CLI surface is in docs/cli-surface.md.`;

// ─── Adapter implementations ──────────────────────────────────────────────

function installClaude(opts: InstallOptions): InstallResult {
  const homeDir = opts.homeDir ?? process.env.HOME ?? "";
  if (!homeDir) throw new Error("claude adapter: HOME is not set");
  const installed: string[] = [];

  // Skills dir
  const skillsBase =
    opts.scope === "user"
      ? path.join(homeDir, ".claude", "skills", "ralphy")
      : path.join(opts.projectRoot ?? process.cwd(), ".claude", "skills", "ralphy");
  removeRecursive(skillsBase);
  if (opts.mode === "symlink") {
    fs.mkdirSync(path.dirname(skillsBase), { recursive: true });
    fs.symlinkSync(opts.bundleDir, skillsBase, "dir");
  } else {
    copyDir(opts.bundleDir, skillsBase);
  }
  installed.push(skillsBase);

  // CLAUDE.md sentinel-merge
  const claudeMd =
    opts.scope === "user"
      ? path.join(homeDir, ".claude", "CLAUDE.md")
      : path.join(opts.projectRoot ?? process.cwd(), "CLAUDE.md");
  const merged = sentinelMerge(readOrEmpty(claudeMd), ROUTING_BLOCK);
  writeFile(claudeMd, merged);
  installed.push(claudeMd);

  return { ok: true, agent: "claude", scope: opts.scope, installed };
}

function installCursor(opts: InstallOptions): InstallResult {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const homeDir = opts.homeDir ?? process.env.HOME ?? "";
  const installed: string[] = [];
  const base =
    opts.scope === "user"
      ? path.join(homeDir, ".cursor", "rules")
      : path.join(projectRoot, ".cursor", "rules");
  const mdc = path.join(base, "ralphy.mdc");
  const body = `---
description: Ralphy CLI routing — read <repo>/AGENTS.md before acting
alwaysApply: true
---

${ROUTING_BLOCK}
`;
  writeFile(mdc, body);
  installed.push(mdc);
  return { ok: true, agent: "cursor", scope: opts.scope, installed };
}

function installCodex(opts: InstallOptions): InstallResult {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const agentsMd = path.join(projectRoot, "AGENTS.md");
  const merged = sentinelMerge(readOrEmpty(agentsMd), ROUTING_BLOCK);
  writeFile(agentsMd, merged);
  return { ok: true, agent: "codex", scope: opts.scope, installed: [agentsMd] };
}

function installCopilot(opts: InstallOptions): InstallResult {
  // Per 03.02.03: writes .github/copilot-instructions.md (router) OR adds a
  // Ralphy section to an existing one (sentinel-merged for idempotency).
  // Per-playbook instructions land under .github/instructions/ralphy-<name>.instructions.md.
  const projectRoot = opts.projectRoot ?? process.cwd();
  const installed: string[] = [];

  const main = path.join(projectRoot, ".github", "copilot-instructions.md");
  const merged = sentinelMerge(readOrEmpty(main), ROUTING_BLOCK);
  writeFile(main, merged);
  installed.push(main);

  // Per-playbook instruction files — one stub per playbook in the routing
  // table. `applyTo: '**'` tells Copilot to load these on every file.
  const playbooks = [
    "intake",
    "researcher",
    "scenarist",
    "art-director",
    "editor",
    "producer",
    "core",
  ];
  for (const pb of playbooks) {
    const filePath = path.join(projectRoot, ".github", "instructions", `ralphy-${pb}.instructions.md`);
    const body = `---
applyTo: '**'
description: "Ralphy ${pb} playbook — read docs/playbooks/${pb}.md before acting"
---

See <repo>/docs/playbooks/${pb}.md for the canonical instructions. AGENTS.md
routes by user intent to the right playbook; this file ensures Copilot loads
the playbook context on every file.
`;
    writeFile(filePath, body);
    installed.push(filePath);
  }

  return { ok: true, agent: "copilot", scope: opts.scope, installed };
}

// ─── Public entry point ────────────────────────────────────────────────────

export function installSkill(opts: InstallOptions): InstallResult {
  switch (opts.agent) {
    case "claude":
      return installClaude(opts);
    case "cursor":
      return installCursor(opts);
    case "codex":
      return installCodex(opts);
    case "copilot":
      return installCopilot(opts);
    default:
      throw new Error(`unsupported agent: ${String(opts.agent)}`);
  }
}

export function uninstallSkill(opts: UninstallOptions): { ok: true; removed: string[] } {
  const removed: string[] = [];
  if (opts.agent === "claude") {
    const homeDir = opts.homeDir ?? process.env.HOME ?? "";
    const skills =
      opts.scope === "user"
        ? path.join(homeDir, ".claude", "skills", "ralphy")
        : path.join(opts.projectRoot ?? process.cwd(), ".claude", "skills", "ralphy");
    removeRecursive(skills);
    removed.push(skills);
    const claudeMd =
      opts.scope === "user"
        ? path.join(homeDir, ".claude", "CLAUDE.md")
        : path.join(opts.projectRoot ?? process.cwd(), "CLAUDE.md");
    const cleaned = stripSentinelBlock(readOrEmpty(claudeMd));
    if (cleaned !== readOrEmpty(claudeMd)) {
      writeFile(claudeMd, cleaned);
      removed.push(claudeMd);
    }
  } else if (opts.agent === "cursor") {
    const projectRoot = opts.projectRoot ?? process.cwd();
    const homeDir = opts.homeDir ?? process.env.HOME ?? "";
    const base =
      opts.scope === "user"
        ? path.join(homeDir, ".cursor", "rules", "ralphy.mdc")
        : path.join(projectRoot, ".cursor", "rules", "ralphy.mdc");
    if (fs.existsSync(base)) {
      fs.unlinkSync(base);
      removed.push(base);
    }
  } else if (opts.agent === "copilot") {
    const projectRoot = opts.projectRoot ?? process.cwd();
    const main = path.join(projectRoot, ".github", "copilot-instructions.md");
    const cleaned = stripSentinelBlock(readOrEmpty(main));
    if (cleaned !== readOrEmpty(main)) {
      if (cleaned.trim().length === 0) {
        if (fs.existsSync(main)) fs.unlinkSync(main);
      } else {
        writeFile(main, cleaned);
      }
      removed.push(main);
    }
    // Remove per-playbook instruction files we authored.
    const instrDir = path.join(projectRoot, ".github", "instructions");
    if (fs.existsSync(instrDir)) {
      for (const f of fs.readdirSync(instrDir)) {
        if (f.startsWith("ralphy-") && f.endsWith(".instructions.md")) {
          const p = path.join(instrDir, f);
          fs.unlinkSync(p);
          removed.push(p);
        }
      }
      // Tidy empty dir
      if (fs.readdirSync(instrDir).length === 0) {
        fs.rmdirSync(instrDir);
      }
    }
  } else if (opts.agent === "codex") {
    const projectRoot = opts.projectRoot ?? process.cwd();
    const agentsMd = path.join(projectRoot, "AGENTS.md");
    const cleaned = stripSentinelBlock(readOrEmpty(agentsMd));
    if (cleaned !== readOrEmpty(agentsMd)) {
      // If the stripped result is now blank-ish, delete the file outright;
      // otherwise rewrite.
      if (cleaned.trim().length === 0) {
        fs.unlinkSync(agentsMd);
      } else {
        writeFile(agentsMd, cleaned);
      }
      removed.push(agentsMd);
    }
  }
  return { ok: true, removed };
}

function stripSentinelBlock(input: string): string {
  const startIdx = input.indexOf(SENTINEL_START);
  const endIdx = input.indexOf(SENTINEL_END);
  if (startIdx < 0 || endIdx <= startIdx) return input;
  const before = input.slice(0, startIdx).replace(/\n*$/, "");
  const after = input.slice(endIdx + SENTINEL_END.length).replace(/^\n*/, "");
  return (before + (before && after ? "\n\n" : "") + after).replace(/\n{3,}/g, "\n\n");
}
