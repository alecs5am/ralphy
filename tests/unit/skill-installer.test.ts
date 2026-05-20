// Unit tests for the skill installer adapters (01.01.06).
//
// Tests run against tmp HOME / repo dirs so the user's real Claude / Cursor /
// Codex configs aren't touched. We test:
//   • Sentinel-bounded merge inserts on first run, replaces on subsequent runs
//     (idempotent).
//   • Claude adapter copies/symlinks the bundle to ~/.claude/skills/ralphy.
//   • Cursor adapter writes .cursor/rules/ralphy.mdc.
//   • Codex adapter ensures AGENTS.md at repo root, sentinel-merged.
//   • Uninstall strips the sentinel block.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  installSkill,
  uninstallSkill,
  sentinelMerge,
  SENTINEL_START,
  SENTINEL_END,
  type AgentId,
} from "../../cli/lib/skill/installer.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-install-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("sentinelMerge", () => {
  test("inserts block on empty / missing input", () => {
    const merged = sentinelMerge("", "Ralphy routing block");
    expect(merged).toContain(SENTINEL_START);
    expect(merged).toContain("Ralphy routing block");
    expect(merged).toContain(SENTINEL_END);
  });

  test("appends block to non-sentineled file without touching prior content", () => {
    const before = "# Existing user config\n\nSome rule.\n";
    const merged = sentinelMerge(before, "INNER");
    expect(merged.startsWith(before)).toBe(true);
    expect(merged).toContain("INNER");
  });

  test("replaces inner content idempotently across re-runs", () => {
    const first = sentinelMerge("# Prior\n", "v1 content");
    const second = sentinelMerge(first, "v2 content");
    // Should still contain v2 once, not v1, and only one sentinel pair.
    expect(second).toContain("v2 content");
    expect(second).not.toContain("v1 content");
    expect(second.match(new RegExp(SENTINEL_START, "g"))?.length).toBe(1);
    expect(second.match(new RegExp(SENTINEL_END, "g"))?.length).toBe(1);
  });

  test("preserves surrounding non-block content on re-run", () => {
    const original = "# Prior\nrule A\n";
    const v1 = sentinelMerge(original, "BLOCK V1");
    const v2 = sentinelMerge(v1, "BLOCK V2");
    expect(v2).toContain("rule A");
  });
});

describe("installSkill — claude adapter", () => {
  test("copies bundle into ~/.claude/skills/ralphy and merges CLAUDE.md", () => {
    // Fake bundle source
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, "SKILL.md"), "fake skill body");

    const home = path.join(tmp, "home");
    fs.mkdirSync(home, { recursive: true });

    const result = installSkill({ agent: "claude", scope: "user", bundleDir: bundle, homeDir: home, mode: "copy" });
    expect(result.ok).toBe(true);
    const dest = path.join(home, ".claude", "skills", "ralphy", "SKILL.md");
    expect(fs.existsSync(dest)).toBe(true);
    // CLAUDE.md should have sentinel-bounded block
    const claudeMd = path.join(home, ".claude", "CLAUDE.md");
    expect(fs.existsSync(claudeMd)).toBe(true);
    const content = fs.readFileSync(claudeMd, "utf8");
    expect(content).toContain(SENTINEL_START);
    expect(content).toContain("Ralphy");
  });

  test("re-running is idempotent (no duplicates)", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, "SKILL.md"), "v1");
    const home = path.join(tmp, "home");
    installSkill({ agent: "claude", scope: "user", bundleDir: bundle, homeDir: home, mode: "copy" });
    installSkill({ agent: "claude", scope: "user", bundleDir: bundle, homeDir: home, mode: "copy" });
    const claudeMd = fs.readFileSync(path.join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(claudeMd.match(new RegExp(SENTINEL_START, "g"))?.length).toBe(1);
  });
});

describe("installSkill — cursor adapter", () => {
  test("writes .cursor/rules/ralphy-router.mdc with alwaysApply: true", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(projectRoot, { recursive: true });
    const result = installSkill({ agent: "cursor", scope: "project", bundleDir: bundle, projectRoot, mode: "copy" });
    expect(result.ok).toBe(true);
    const router = path.join(projectRoot, ".cursor", "rules", "ralphy-router.mdc");
    expect(fs.existsSync(router)).toBe(true);
    const body = fs.readFileSync(router, "utf8");
    expect(body).toContain("alwaysApply: true");
    expect(body).toContain("AGENTS.md");
  });

  test("writes one .cursor/rules/ralphy-<playbook>.mdc per playbook with description", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(projectRoot, { recursive: true });
    installSkill({ agent: "cursor", scope: "project", bundleDir: bundle, projectRoot, mode: "copy" });
    const rulesDir = path.join(projectRoot, ".cursor", "rules");
    const files = fs.readdirSync(rulesDir);
    // Should have the router plus at least the canonical playbooks.
    expect(files).toContain("ralphy-router.mdc");
    expect(files).toContain("ralphy-intake.mdc");
    expect(files).toContain("ralphy-researcher.mdc");
    expect(files).toContain("ralphy-editor.mdc");
    // Per-playbook files use Agent-Requested mode (description set, no
    // alwaysApply).
    const intake = fs.readFileSync(path.join(rulesDir, "ralphy-intake.mdc"), "utf8");
    expect(intake).toContain("description:");
    expect(intake).not.toContain("alwaysApply: true");
  });

  test("uninstall removes all ralphy-*.mdc files", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(projectRoot, { recursive: true });
    installSkill({ agent: "cursor", scope: "project", bundleDir: bundle, projectRoot, mode: "copy" });
    uninstallSkill({ agent: "cursor", scope: "project", projectRoot });
    const rulesDir = path.join(projectRoot, ".cursor", "rules");
    // Either no dir or no ralphy-* files
    if (fs.existsSync(rulesDir)) {
      const left = fs.readdirSync(rulesDir).filter((f) => f.startsWith("ralphy-"));
      expect(left).toEqual([]);
    }
  });
});

describe("installSkill — codex adapter", () => {
  test("ensures AGENTS.md at repo root, sentinel-merged", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(projectRoot, { recursive: true });
    const result = installSkill({ agent: "codex", scope: "project", bundleDir: bundle, projectRoot, mode: "copy" });
    expect(result.ok).toBe(true);
    const agentsMd = path.join(projectRoot, "AGENTS.md");
    expect(fs.existsSync(agentsMd)).toBe(true);
    expect(fs.readFileSync(agentsMd, "utf8")).toContain(SENTINEL_START);
  });

  test("respects an existing foreign AGENTS.md by merging via sentinels", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(projectRoot, { recursive: true });
    const existing = "# Foreign AGENTS.md\n\nFooBar agent rules.\n";
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), existing);
    installSkill({ agent: "codex", scope: "project", bundleDir: bundle, projectRoot, mode: "copy" });
    const merged = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    expect(merged).toContain("FooBar agent rules");  // preserved
    expect(merged).toContain(SENTINEL_START);  // ralphy block added
  });
});

describe("uninstallSkill", () => {
  test("strips the sentinel block from CLAUDE.md", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    const home = path.join(tmp, "home");
    installSkill({ agent: "claude", scope: "user", bundleDir: bundle, homeDir: home, mode: "copy" });
    uninstallSkill({ agent: "claude", scope: "user", homeDir: home });
    const claudeMd = fs.readFileSync(path.join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(claudeMd).not.toContain(SENTINEL_START);
  });

  test("removes the ralphy skills dir on claude uninstall", () => {
    const bundle = path.join(tmp, "bundle");
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, "SKILL.md"), "x");
    const home = path.join(tmp, "home");
    installSkill({ agent: "claude", scope: "user", bundleDir: bundle, homeDir: home, mode: "copy" });
    expect(fs.existsSync(path.join(home, ".claude", "skills", "ralphy"))).toBe(true);
    uninstallSkill({ agent: "claude", scope: "user", homeDir: home });
    expect(fs.existsSync(path.join(home, ".claude", "skills", "ralphy"))).toBe(false);
  });
});

describe("installSkill — agent allow-list", () => {
  test("rejects unknown agent id", () => {
    expect(() =>
      installSkill({ agent: "windsurf" as AgentId, scope: "user", bundleDir: tmp, homeDir: tmp, mode: "copy" }),
    ).toThrow(/unsupported/i);
  });
});
