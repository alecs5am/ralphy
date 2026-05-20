// Integration tests for `ralphy ref check` and `--no-ref-consent`
// (04.02.02 + 04.02.03 — reference-required gate).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FIXTURE_CATALOG = path.join(REPO, "tests", "fixtures", "or-catalog.json");

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not json */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cli-refcheck-"));
  fs.mkdirSync(path.join(tmpRoot, "workspace", ".ralph"), { recursive: true });
  fs.copyFileSync(FIXTURE_CATALOG, path.join(tmpRoot, "workspace", ".ralph", "or-catalog.json"));
  // A registry with one project (so `ref check` can find it).
  const registry = {
    projects: {
      "test-brand-001": {
        id: "test-brand-001",
        name: "Old Spice hero",
        brief: "Old Spice style hero shot — bare-chest guy on a horse",
        refs: [],
      },
      "test-generic-001": {
        id: "test-generic-001",
        name: "Generic coffee ad",
        brief: "Coffee shop pastry, founder on camera, autumn vibe",
        refs: [],
      },
    },
    refs: {},
    brands: {},
    personas: {},
    templates: {},
    batches: {},
  };
  fs.writeFileSync(
    path.join(tmpRoot, "workspace", ".ralph", "registry.json"),
    JSON.stringify(registry, null, 2),
  );
  // Project dirs for both.
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "test-brand-001"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "test-generic-001"), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("ralphy ref check (04.02.02)", () => {
  test("--text classifies a brand-product brief", () => {
    const r = ralphy(["ref", "check", "_", "--text", "Old Spice style hero shot"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.required).toBe(true);
    expect(r.json.kind).toBe("brand-product");
    expect(r.json.matches?.[0]).toContain("Old Spice");
  });

  test("--text classifies a generic brief as not requiring a ref", () => {
    const r = ralphy(["ref", "check", "_", "--text", "Make me a generic coffee ad"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.required).toBe(false);
  });

  test("project mode flags a brand brief with no attached refs", () => {
    const r = ralphy(["ref", "check", "test-brand-001"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.required).toBe(true);
    expect(r.json.satisfied).toBe(false);
    expect(r.json.kind).toBe("brand-product");
  });

  test("project mode passes a generic brief", () => {
    const r = ralphy(["ref", "check", "test-generic-001"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.required).toBe(false);
    expect(r.json.satisfied).toBe(true);
  });

  test("project mode raises E_NOT_FOUND for unknown project", () => {
    const r = ralphy(["ref", "check", "no-such-project"]);
    expect(r.exitCode).not.toBe(0);
    const msg = r.stderr + r.stdout;
    expect(msg.toLowerCase()).toContain("not found");
  });
});

describe("ralphy generate --no-ref-consent (04.02.03)", () => {
  test("passing --no-ref-consent <reason> appends stage:no-ref-consent to user-prompts.jsonl", () => {
    const r = ralphy([
      "generate",
      "image",
      "--project",
      "test-brand-001",
      "--slot",
      "scene-01-bg",
      "--prompt",
      "Old Spice hero",
      "--no-ref-consent",
      "I understand the quality will be worse",
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    const log = path.join(
      tmpRoot,
      "workspace",
      "projects",
      "test-brand-001",
      "logs",
      "user-prompts.jsonl",
    );
    expect(fs.existsSync(log)).toBe(true);
    const lines = fs.readFileSync(log, "utf8").trim().split("\n");
    const entries = lines.map((l) => JSON.parse(l));
    const consent = entries.find((e) => e.stage === "no-ref-consent");
    expect(consent).toBeTruthy();
    expect(consent.text).toContain("I understand");
    expect(consent.note).toBe("slot=scene-01-bg");
  });

  test("omitting --no-ref-consent does not write a consent entry", () => {
    const r = ralphy([
      "generate",
      "image",
      "--project",
      "test-brand-001",
      "--slot",
      "scene-01-bg",
      "--prompt",
      "Old Spice hero",
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    const log = path.join(
      tmpRoot,
      "workspace",
      "projects",
      "test-brand-001",
      "logs",
      "user-prompts.jsonl",
    );
    if (fs.existsSync(log)) {
      const lines = fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
      const entries = lines.map((l) => JSON.parse(l));
      const consent = entries.find((e) => e.stage === "no-ref-consent");
      expect(consent).toBeFalsy();
    }
  });
});
