// Unit tests for scripts/lint-agents-md.ts (03.05.01).
//
// The lint verifies:
//   • Every row in the AGENTS.md routing table points at an existing playbook
//     in docs/playbooks/ (or .agents/skills/ for skill-led rows).
//   • Every playbook listed has a matching SKILL.md (when a skill folder of
//     the same name exists).
//   • No Claude-isms in AGENTS.md (no `~/.claude/` paths, no `claude mcp add`
//     references in the routing table).
//   • CLAUDE.md contains no routing rules absent from AGENTS.md.

import { describe, test, expect } from "bun:test";
import {
  parseRoutingTable,
  scanForClaudeIsms,
  type RoutingRow,
} from "../../scripts/lint-agents-md.js";

describe("parseRoutingTable", () => {
  test("extracts rows pointing at docs/playbooks/", () => {
    const src = `
| Intent A | [\`docs/playbooks/researcher.md\`](docs/playbooks/researcher.md) |
| Intent B | [\`docs/playbooks/editor.md\`](docs/playbooks/editor.md) |
`;
    const rows = parseRoutingTable(src);
    const targets = rows.map((r: RoutingRow) => r.target);
    expect(targets).toContain("docs/playbooks/researcher.md");
    expect(targets).toContain("docs/playbooks/editor.md");
  });

  test("extracts rows pointing at .agents/skills/", () => {
    const src = `
| Intent | [\`.agents/skills/ralph-researcher/SKILL.md\`](.agents/skills/ralph-researcher/SKILL.md) |
`;
    const rows = parseRoutingTable(src);
    expect(rows[0]!.target).toBe(".agents/skills/ralph-researcher/SKILL.md");
  });

  test("ignores non-routing content", () => {
    const src = `# Heading\n\nRandom text not in a table.\n`;
    expect(parseRoutingTable(src)).toEqual([]);
  });
});

describe("scanForClaudeIsms", () => {
  test("flags ~/.claude/ paths", () => {
    const findings = scanForClaudeIsms("Use `~/.claude/CLAUDE.md` for routing.");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.includes("~/.claude/"))).toBe(true);
  });

  test("flags `claude mcp add` references", () => {
    const findings = scanForClaudeIsms("Run `claude mcp add ralphy ...` before starting.");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.includes("claude mcp add"))).toBe(true);
  });

  test("passes a clean AGENTS.md", () => {
    const findings = scanForClaudeIsms(
      "Read `docs/playbooks/core.md` for setup. Run `ralphy setup`.",
    );
    expect(findings).toEqual([]);
  });
});
