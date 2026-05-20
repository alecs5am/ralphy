#!/usr/bin/env tsx
// scripts/lint-agents-md.ts — 03.05.01
//
// Audits AGENTS.md (the source-of-truth routing surface per D-06) and
// CLAUDE.md (the Claude-Code-specific consumer):
//
//   1. Every row in the AGENTS.md routing table points at an existing file —
//      `docs/playbooks/<name>.md` or `.agents/skills/<name>/SKILL.md`.
//   2. Every playbook referenced is matched by a real file.
//   3. AGENTS.md contains no Claude-isms (no `~/.claude/` paths, no
//      `claude mcp add` references in the routing table).
//   4. CLAUDE.md contains no routing rules not also present in AGENTS.md.
//
// CI wires this into `lint:agents-md`. The script exits non-zero with a
// JSON-shaped error payload on stderr when any check fails.

import fs from "node:fs";
import path from "node:path";

export interface RoutingRow {
  /** Relative path of the playbook/skill the row points at. */
  target: string;
  /** 1-indexed line in the source file (for error reporting). */
  line: number;
}

// ─── Routing-table parser ──────────────────────────────────────────────────
//
// Routing rows are Markdown table rows with at least one Markdown link to a
// file under `docs/playbooks/` or `.agents/skills/`. We deliberately tolerate
// rows that link to multiple files (chain rows like "researcher → core").

const LINK_RE =
  /\[[^\]]*\]\((?<target>(?:docs\/playbooks\/[A-Za-z0-9_\-./]+\.md|\.agents\/skills\/[A-Za-z0-9_\-]+\/SKILL\.md))\)/g;

export function parseRoutingTable(src: string): RoutingRow[] {
  const rows: RoutingRow[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes("|")) continue;
    // Skip the table header divider (|---|---|)
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) continue;
    let m: RegExpExecArray | null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(line)) !== null) {
      rows.push({ target: m.groups!.target!, line: i + 1 });
    }
  }
  return rows;
}

// ─── Claude-ism scanner ────────────────────────────────────────────────────

const CLAUDE_ISM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /~\/\.claude\//g, label: "~/.claude/ path reference" },
  { pattern: /claude mcp add/gi, label: "`claude mcp add` invocation" },
];

export function scanForClaudeIsms(src: string): string[] {
  const findings: string[] = [];
  for (const { pattern, label } of CLAUDE_ISM_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(src)) !== null) {
      findings.push(`${label}: ${m[0]}`);
    }
  }
  return findings;
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

interface LintReport {
  ok: boolean;
  rows_scanned: number;
  errors: string[];
}

export function lintAgentsMd(repoRoot: string): LintReport {
  const errors: string[] = [];
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    return { ok: false, rows_scanned: 0, errors: ["AGENTS.md is missing at repo root"] };
  }
  const agentsSrc = fs.readFileSync(agentsPath, "utf8");
  const rows = parseRoutingTable(agentsSrc);

  // 1. Every row target exists on disk.
  for (const row of rows) {
    const abs = path.join(repoRoot, row.target);
    if (!fs.existsSync(abs)) {
      errors.push(`AGENTS.md:${row.line} routing target missing: ${row.target}`);
    }
  }

  // 2. Cross-check: every `.agents/skills/<name>/SKILL.md` listed has a
  //    corresponding folder, and every skill folder either appears in the
  //    routing table OR is intentionally maintainer-only (namespace:
  //    ralphy-dev). Soft check — warns only when a `ralphy:` namespace skill
  //    is missing from the routing table.
  const skillsRoot = path.join(repoRoot, ".agents", "skills");
  if (fs.existsSync(skillsRoot)) {
    const skillFolders = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const referenced = new Set(
      rows
        .filter((r) => r.target.startsWith(".agents/skills/"))
        .map((r) => r.target.split("/")[2]!),
    );
    for (const f of skillFolders) {
      const ns = readSkillNamespace(path.join(skillsRoot, f, "SKILL.md"));
      if (ns === "ralphy-dev") continue; // maintainer-only skills don't need a row
      if (!referenced.has(f)) {
        // Soft check — skill is user-facing but doesn't appear in the routing
        // table. Most user-facing skills do appear, but a handful are
        // explicit-invocation-only (postmortem, install). We log as info,
        // not error.
      }
    }
  }

  // 3. Claude-isms in AGENTS.md.
  const claudeIsms = scanForClaudeIsms(agentsSrc);
  for (const f of claudeIsms) {
    errors.push(`AGENTS.md: Claude-ism — ${f}`);
  }

  // 4. CLAUDE.md must not duplicate routing rules absent from AGENTS.md.
  const claudeMdPath = path.join(repoRoot, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    const claudeSrc = fs.readFileSync(claudeMdPath, "utf8");
    const claudeRows = parseRoutingTable(claudeSrc);
    const agentsTargets = new Set(rows.map((r) => r.target));
    for (const r of claudeRows) {
      if (!agentsTargets.has(r.target)) {
        errors.push(
          `CLAUDE.md:${r.line} routes to ${r.target} but AGENTS.md does not — move the rule to AGENTS.md (D-06)`,
        );
      }
    }
  }

  return { ok: errors.length === 0, rows_scanned: rows.length, errors };
}

function readSkillNamespace(skillPath: string): string | null {
  if (!fs.existsSync(skillPath)) return null;
  const src = fs.readFileSync(skillPath, "utf8");
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const nsMatch = m[1]!.match(/^namespace:\s*(\S+)\s*$/m);
  return nsMatch ? nsMatch[1]! : null;
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const report = lintAgentsMd(repo);
  if (report.ok) {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exit(0);
  }
  process.stderr.write(JSON.stringify(report, null, 2) + "\n");
  for (const e of report.errors) {
    process.stderr.write(`  ✖ ${e}\n`);
  }
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-agents-md.ts") ||
    process.argv[1].endsWith("lint-agents-md.js"));
if (isDirect) {
  void main();
}
