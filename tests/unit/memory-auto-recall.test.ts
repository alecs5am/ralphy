// Unit tests for auto-recall embedding (#117) — memory loads itself through
// the calls the agent already makes: bare `ralphy` (step 0) and explicit
// `ralphy memory recall --workspace`. Spawns the real CLI against a
// tmp root (no in-process server involved, so spawnSync is fine per #072).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; json: any } {
  const r = spawnSync("bun", [CLI, "--cwd", tmpRoot, "--json", ...args], {
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
  return { exitCode: r.status ?? -1, json };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-autorecall-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("auto-recall embedding (#117)", () => {
  test("bare `ralphy` JSON embeds the memory digest", () => {
    const noted = ralphy(["memory", "note", "Durable global rule.", "--slug", "global-rule", "--type", "craft"]);
    expect(noted.exitCode).toBe(0);

    const status = ralphy([]);
    expect(status.exitCode).toBe(0);
    expect(status.json.memory).toBeTruthy();
    expect(status.json.memory.count).toBe(1);
    expect(status.json.memory.entries[0]).toEqual({
      slug: "global-rule",
      tier: "global",
      description: "Durable global rule.",
    });
    expect(status.json.memory.note.length).toBeGreaterThan(0); // injection-hygiene note rides along
  });

  test("explicit workspace recall overrides global without an active pointer", () => {
    ralphy(["workspace", "create", "acme"]);
    ralphy(["memory", "note", "Global truth.", "--slug", "collide", "--type", "craft"]);
    ralphy(["memory", "note", "Acme truth.", "--slug", "collide", "--type", "client", "--workspace", "acme"]);

    const r = ralphy(["memory", "recall", "--workspace", "acme"]);
    expect(r.exitCode).toBe(0);
    expect(r.json.workspace).toBe("acme");
    const collide = r.json.entries.find((e: any) => e.slug === "collide");
    expect(collide.tier).toBe("workspace");
    expect(ralphy(["workspace", "use", "acme"]).exitCode).toBe(2);
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "config.json"))).toBe(false);
  });

  test("empty store yields a null-or-empty digest, never an error", () => {
    const status = ralphy([]);
    expect(status.exitCode).toBe(0);
    // No entries: digest is either null (store error path) or count 0.
    if (status.json.memory !== null) expect(status.json.memory.count).toBe(0);
  });
});
