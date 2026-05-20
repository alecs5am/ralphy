// Integration tests for `ralphy skill install / uninstall` (01.01.06).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-skill-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[], cwd = tmpHome): { exitCode: number; stdout: string; stderr: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome },
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

describe("ralphy skill install", () => {
  test("--help shows examples for each adapter", () => {
    const r = ralphy(["skill", "install", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("--agent claude");
    expect(r.stdout).toContain("--agent cursor");
    expect(r.stdout).toContain("--agent codex");
  });

  test("--agent windsurf → E_AGENT_UNSUPPORTED", () => {
    const r = ralphy(["skill", "install", "--agent", "windsurf"]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_AGENT_UNSUPPORTED");
  });

  test("--agent codex creates AGENTS.md with sentinel block", () => {
    const projTmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-skill-proj-"));
    try {
      const r = ralphy(["skill", "install", "--agent", "codex"], projTmp);
      expect(r.exitCode).toBe(0);
      const agentsMd = path.join(projTmp, "AGENTS.md");
      expect(fs.existsSync(agentsMd)).toBe(true);
      expect(fs.readFileSync(agentsMd, "utf8")).toContain("ralphy:start");
    } finally {
      fs.rmSync(projTmp, { recursive: true, force: true });
    }
  });
});
