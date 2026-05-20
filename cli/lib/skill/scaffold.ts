// Scaffold a new skill (03.06.01).
//
// Writes:
//   • .agents/skills/<name>/SKILL.md   — agentskills.io-compliant frontmatter
//                                        + section stubs (## Trigger, ## Hard
//                                        invariants, ## Workflow, ## Outputs,
//                                        ## Cookbook).
//   • docs/playbooks/<name>.md         — one-paragraph stub.
//
// Optional: append a row to AGENTS.md's routing table, bounded by sentinel
// comments so re-runs are idempotent (per D-02).

import fs from "node:fs";
import path from "node:path";

export interface ScaffoldOptions {
  repoRoot: string;
  name: string;
  intent: string;
  triggers: string[];
  namespace: "ralphy" | "ralphy-dev";
}

export interface ScaffoldResult {
  skillPath: string;
  playbookPath: string;
  routingTableUpdated?: boolean;
}

export function scaffoldSkill(opts: ScaffoldOptions): ScaffoldResult {
  const skillDir = path.join(opts.repoRoot, ".agents", "skills", opts.name);
  const skillPath = path.join(skillDir, "SKILL.md");
  const playbookPath = path.join(opts.repoRoot, "docs", "playbooks", `${opts.name}.md`);

  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.dirname(playbookPath), { recursive: true });

  const description = buildDescription(opts.intent, opts.triggers);
  const skillBody = `---
name: ${opts.name}
namespace: ${opts.namespace}
description: >-
${indent(description, "  ")}
---

# ${titleCase(opts.name)}

## Trigger
${opts.intent}

USE WHEN:
${opts.triggers.map((t) => `- "${t}"`).join("\n")}

## Hard invariants
- TODO — list must-do / must-not lines, one bullet each.

## Workflow
1. TODO — name the exact \`ralphy <verb>\` calls.

## Outputs
- TODO — what the user sees and what gets written to disk.

## Cookbook
- TODO — concrete worked example (EN + RU if relevant).

> Canonical playbook lives at \`docs/playbooks/${opts.name}.md\`.
`;
  fs.writeFileSync(skillPath, skillBody);

  const playbookBody = `# ${titleCase(opts.name)} playbook

> Scaffolded by \`ralphy skill new ${opts.name}\`. Fill in the workflow before
> wiring this into the AGENTS.md routing table.

## Intent

${opts.intent}

## Trigger phrases

${opts.triggers.map((t) => `- "${t}"`).join("\n")}

## Workflow

TODO — step-by-step. Each step names the exact \`ralphy <verb>\` call.

## Outputs

TODO — what the user sees and what gets written to disk.
`;
  fs.writeFileSync(playbookPath, playbookBody);

  return { skillPath, playbookPath };
}

// ─── AGENTS.md routing insert ──────────────────────────────────────────────

const ROUTING_SENTINEL_START = "<!-- ralphy:routing-extra:start -->";
const ROUTING_SENTINEL_END = "<!-- ralphy:routing-extra:end -->";

export interface RoutingInsertOptions {
  repoRoot: string;
  name: string;
  rowText: string;
}

/**
 * Append a row to the AGENTS.md routing table, inside a sentinel-bounded
 * block so re-runs only ever amend the block instead of duplicating rows.
 * Returns true if AGENTS.md was modified, false if the row already existed.
 */
export function insertRoutingRow(opts: RoutingInsertOptions): boolean {
  const agentsPath = path.join(opts.repoRoot, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return false;
  let src = fs.readFileSync(agentsPath, "utf8");

  const row = `| ${opts.rowText} | [\`docs/playbooks/${opts.name}.md\`](docs/playbooks/${opts.name}.md) |`;

  const startIdx = src.indexOf(ROUTING_SENTINEL_START);
  const endIdx = src.indexOf(ROUTING_SENTINEL_END);

  if (startIdx >= 0 && endIdx > startIdx) {
    const inner = src.slice(startIdx + ROUTING_SENTINEL_START.length, endIdx);
    if (inner.includes(`docs/playbooks/${opts.name}.md`)) {
      // Already inserted — idempotent re-run is a no-op.
      return false;
    }
    const newInner = inner.replace(/\s*$/, "") + "\n" + row + "\n";
    src =
      src.slice(0, startIdx + ROUTING_SENTINEL_START.length) +
      newInner +
      src.slice(endIdx);
    fs.writeFileSync(agentsPath, src);
    return true;
  }

  // No sentinel block yet — append one after the existing routing table. We
  // look for the routing section header and insert before the next "## "
  // heading or at EOF.
  const routingMatch = src.match(/^##\s+Routing\b[\s\S]*?(?=^##\s+|\Z)/m);
  let insertAt: number;
  if (routingMatch && routingMatch.index !== undefined) {
    insertAt = routingMatch.index + routingMatch[0].length;
  } else {
    insertAt = src.length;
  }
  const block = `\n${ROUTING_SENTINEL_START}\n${row}\n${ROUTING_SENTINEL_END}\n`;
  src = src.slice(0, insertAt) + block + src.slice(insertAt);
  fs.writeFileSync(agentsPath, src);
  return true;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildDescription(intent: string, triggers: string[]): string {
  const triggerLine = triggers.map((t) => `"${t}"`).join(", ");
  return `${intent} USE WHEN: ${triggerLine}.`;
}

function indent(s: string, prefix: string): string {
  return s
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
