// Unit tests for the skill-install wizard helpers (03.02.06).
//
// The wizard mechanics live in `cli/lib/skill/wizard.ts` so the clack-driven
// runtime stays separable from the pure decision functions (detection, config
// persistence, scope defaulting).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectAgentsInEnv,
  defaultScopeFor,
  persistInstallChoice,
  loadInstallChoice,
  type DetectedAgent,
} from "../../cli/lib/skill/wizard.js";
import {
  setGlobalConfigPath,
  resetGlobalConfigPath,
  readGlobalConfig,
} from "../../cli/lib/global-config.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-wizard-"));
  setGlobalConfigPath(path.join(tmp, ".ralphy", "config.json"));
});

afterEach(() => {
  resetGlobalConfigPath();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("detectAgentsInEnv", () => {
  test("returns claude when ~/.claude exists", () => {
    fs.mkdirSync(path.join(tmp, "home", ".claude"), { recursive: true });
    const found = detectAgentsInEnv({ homeDir: path.join(tmp, "home"), projectRoot: tmp });
    const ids = found.map((d) => d.agent);
    expect(ids).toContain("claude");
  });

  test("returns codex when AGENTS.md exists at project root", () => {
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, "AGENTS.md"), "# AGENTS.md");
    const found = detectAgentsInEnv({ homeDir: tmp, projectRoot: proj });
    expect(found.map((d) => d.agent)).toContain("codex");
  });

  test("returns cursor when ~/.cursor or .cursor exists", () => {
    fs.mkdirSync(path.join(tmp, "home", ".cursor"), { recursive: true });
    const found = detectAgentsInEnv({ homeDir: path.join(tmp, "home"), projectRoot: tmp });
    expect(found.map((d) => d.agent)).toContain("cursor");
  });

  test("returns copilot when .github/copilot-instructions.md exists", () => {
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(path.join(proj, ".github"), { recursive: true });
    fs.writeFileSync(path.join(proj, ".github", "copilot-instructions.md"), "");
    const found = detectAgentsInEnv({ homeDir: tmp, projectRoot: proj });
    expect(found.map((d) => d.agent)).toContain("copilot");
  });

  test("returns empty when nothing detected", () => {
    const found = detectAgentsInEnv({ homeDir: tmp, projectRoot: tmp });
    expect(found).toEqual([]);
  });
});

describe("defaultScopeFor", () => {
  test("codex is always project", () => {
    expect(defaultScopeFor("codex")).toBe("project");
  });
  test("copilot is always project", () => {
    expect(defaultScopeFor("copilot")).toBe("project");
  });
  test("claude defaults to user", () => {
    expect(defaultScopeFor("claude")).toBe("user");
  });
  test("cursor defaults to user", () => {
    expect(defaultScopeFor("cursor")).toBe("user");
  });
});

describe("persistInstallChoice / loadInstallChoice", () => {
  test("round-trips the choice through global config", () => {
    persistInstallChoice({
      installedAgents: ["claude", "cursor"],
      installScope: "user",
      installDevNamespace: false,
    });
    const loaded = loadInstallChoice();
    expect(loaded).not.toBeNull();
    expect(loaded!.installedAgents).toEqual(["claude", "cursor"]);
    expect(loaded!.installScope).toBe("user");
    expect(loaded!.installDevNamespace).toBe(false);
  });

  test("writes a wizardCompletedAt timestamp", () => {
    persistInstallChoice({
      installedAgents: ["claude"],
      installScope: "user",
      installDevNamespace: false,
    });
    const cfg = readGlobalConfig() as { skill?: { wizardCompletedAt?: string } };
    expect(cfg.skill?.wizardCompletedAt).toBeTruthy();
  });

  test("loadInstallChoice returns null when no skill config exists", () => {
    expect(loadInstallChoice()).toBeNull();
  });

  test("loadInstallChoice returns null when wizardCompletedAt missing", () => {
    // Persist a partial config under skill.* without the timestamp — should
    // be treated as never-completed.
    const { configSet } = require("../../cli/lib/global-config.js") as typeof import("../../cli/lib/global-config.js");
    configSet("skill.installedAgents", ["claude"]);
    expect(loadInstallChoice()).toBeNull();
  });
});

describe("DetectedAgent shape", () => {
  test("each detection carries the path that triggered it", () => {
    fs.mkdirSync(path.join(tmp, "home", ".claude"), { recursive: true });
    const found = detectAgentsInEnv({ homeDir: path.join(tmp, "home"), projectRoot: tmp });
    const claude = found.find((d: DetectedAgent) => d.agent === "claude");
    expect(claude).toBeDefined();
    expect(claude!.evidence).toContain(".claude");
  });
});
