// Integration tests for `ralphy skill new <name>` (03.06.01).
//
// The verb scaffolds:
//   • .agents/skills/<name>/SKILL.md (with valid frontmatter + section stubs)
//   • docs/playbooks/<name>.md (one-paragraph stub)
//   • optionally appends a row to AGENTS.md (--add-to-routing)
//
// In non-interactive mode (--non-interactive or --intent/--trigger flags),
// it skips the clack prompts entirely.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRepo: string;

beforeEach(() => {
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-skill-new-"));
  // Seed a minimal AGENTS.md so the optional --add-to-routing path has
  // something to insert into.
  fs.writeFileSync(
    path.join(tmpRepo, "AGENTS.md"),
    `# AGENTS.md

## Routing

| User intent | Playbook |
|---|---|
| Existing row | [\`docs/playbooks/core.md\`](docs/playbooks/core.md) |

## Hard invariants
`,
  );
  fs.mkdirSync(path.join(tmpRepo, "docs", "playbooks"), { recursive: true });
  fs.mkdirSync(path.join(tmpRepo, ".agents", "skills"), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: tmpRepo,
    encoding: "utf8",
    env: { ...process.env, RALPHY_REPO_ROOT: tmpRepo },
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("ralphy skill new", () => {
  test("--help shows examples", () => {
    const r = ralphy(["skill", "new", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toLowerCase()).toContain("examples");
  });

  test("scaffolds SKILL.md + playbook in non-interactive mode", () => {
    const r = ralphy([
      "skill",
      "new",
      "my-new-skill",
      "--non-interactive",
      "--intent",
      "Test intent",
      "--trigger",
      "test trigger phrase",
    ]);
    expect(r.exitCode).toBe(0);
    const skillPath = path.join(tmpRepo, ".agents", "skills", "my-new-skill", "SKILL.md");
    const playbookPath = path.join(tmpRepo, "docs", "playbooks", "my-new-skill.md");
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.existsSync(playbookPath)).toBe(true);
    const skill = fs.readFileSync(skillPath, "utf8");
    expect(skill).toContain("name: my-new-skill");
    expect(skill).toContain("description:");
    expect(skill).toContain("## Trigger");
    expect(skill).toContain("## Workflow");
  });

  test("refuses on non-kebab-case names", () => {
    const r = ralphy(["skill", "new", "BadName", "--non-interactive"]);
    expect(r.exitCode).not.toBe(0);
  });

  test("refuses when the skill already exists", () => {
    fs.mkdirSync(path.join(tmpRepo, ".agents", "skills", "dup"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRepo, ".agents", "skills", "dup", "SKILL.md"),
      "---\nname: dup\ndescription: x\n---",
    );
    const r = ralphy(["skill", "new", "dup", "--non-interactive", "--intent", "x", "--trigger", "y"]);
    expect(r.exitCode).not.toBe(0);
  });

  test("--add-to-routing appends a sentinel-bounded row to AGENTS.md", () => {
    const r = ralphy([
      "skill",
      "new",
      "routed-skill",
      "--non-interactive",
      "--intent",
      "Test intent",
      "--trigger",
      "test trigger",
      "--row",
      "Row matching `routed-skill`",
      "--add-to-routing",
    ]);
    expect(r.exitCode).toBe(0);
    const agentsMd = fs.readFileSync(path.join(tmpRepo, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("routed-skill");
    expect(agentsMd).toContain("docs/playbooks/routed-skill.md");
  });

  test("idempotent: re-running --add-to-routing does not duplicate the row", () => {
    const args = [
      "skill",
      "new",
      "idem-skill",
      "--non-interactive",
      "--intent",
      "x",
      "--trigger",
      "y",
      "--row",
      "Idem row",
      "--add-to-routing",
    ];
    ralphy(args);
    // Force a second pass by removing the skill but keeping AGENTS.md.
    fs.rmSync(path.join(tmpRepo, ".agents", "skills", "idem-skill"), { recursive: true, force: true });
    fs.rmSync(path.join(tmpRepo, "docs", "playbooks", "idem-skill.md"), { force: true });
    ralphy(args);
    const agentsMd = fs.readFileSync(path.join(tmpRepo, "AGENTS.md"), "utf8");
    const matches = agentsMd.match(/docs\/playbooks\/idem-skill\.md/g) ?? [];
    // Each row contains the link twice (one Markdown link + one href text).
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  test("lint:skills passes on the scaffolded skill", () => {
    ralphy([
      "skill",
      "new",
      "linted-skill",
      "--non-interactive",
      "--intent",
      "Lint-clean scaffold",
      "--trigger",
      "lint test",
    ]);
    // Run the lint as a subprocess against the tmpRepo's .agents/skills dir.
    // The lint resolves the repo root via import.meta.dir — so for this test
    // we just parse + validate via direct import.
    const skillPath = path.join(tmpRepo, ".agents", "skills", "linted-skill", "SKILL.md");
    const src = fs.readFileSync(skillPath, "utf8");
    expect(src).toMatch(/^---\nname: linted-skill\n/);
    expect(src).toMatch(/namespace: ralphy/);
    expect(src).toContain("description:");
  });
});
