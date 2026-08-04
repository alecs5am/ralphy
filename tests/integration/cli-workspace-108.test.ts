// Integration smoke for the entity-backed Workspace and Project ownership
// surfaces, plus the deprecated `workspace use` and legacy-layout gates.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ws-108-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function stderrErrorCode(stderr: string): string | null {
  const line = stderr
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!line) return null;
  try {
    return JSON.parse(line)?.error?.code ?? null;
  } catch {
    return null;
  }
}

describe("ralphy workspace entities and Project ownership (#108)", () => {
  test("create → page → deprecated use → Project create → transfer round-trip", () => {
    const c = ralphy(["workspace", "create", "fogtown", "--name", "Fog Town", "--description", "horror universe"]);
    expect(c.exitCode).toBe(0);
    expect(c.json.slug).toBe("fogtown");
    expect(c.json.name).toBe("Fog Town");
    expect(c.json.id).toStartWith("ws_");
    expect(c.json.rowVersion).toBe(1);

    const l = ralphy(["workspace", "list"]);
    expect(l.exitCode).toBe(0);
    expect(Object.keys(l.json).sort()).toEqual(["items", "nextCursor"]);
    expect(l.json.items).toEqual([c.json]);
    expect(l.json.nextCursor).toBeNull();

    const u = ralphy(["workspace", "use", "default"]);
    expect(u.exitCode).toBe(2);
    expect(stderrErrorCode(u.stderr)).toBe("E_INPUT_INVALID");
    expect(u.stderr).toContain("--workspace");
    expect(u.stderr).toContain("session start");
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "config.json"))).toBe(false);

    const p = ralphy([
      "project",
      "create",
      "Reel 001",
      "--as",
      "reel-001",
      "--workspace",
      c.json.id,
    ]);
    expect(p.exitCode).toBe(0);
    expect(p.json.id).toStartWith("prj_");
    expect(p.json.slug).toBe("reel-001");
    expect(p.json.workspaceId).toBe(c.json.id);

    const s = ralphy(["workspace", "show", c.json.id]);
    expect(s.exitCode).toBe(0);
    expect(s.json).toEqual(c.json);

    const archive = ralphy(["workspace", "create", "archive"]);
    expect(archive.exitCode).toBe(0);
    const transferred = ralphy([
      "project",
      "transfer",
      p.json.id,
      "--to",
      archive.json.id,
      "--expected",
      String(p.json.rowVersion),
    ]);
    expect(transferred.exitCode).toBe(0);
    expect(transferred.json).toMatchObject({
      state: "completed",
      destinationWorkspaceId: archive.json.id,
    });
    expect(transferred.json).not.toHaveProperty("sourceBucket");
    expect(transferred.json).not.toHaveProperty("destinationBucket");

    const ps = ralphy(["project", "show", p.json.id]);
    expect(ps.exitCode).toBe(0);
    expect(ps.json.id).toBe(p.json.id);
    expect(ps.json.workspaceId).toBe(archive.json.id);
  });

  test("create refuses a duplicate slug and an invalid slug", () => {
    expect(ralphy(["workspace", "create", "dup"]).exitCode).toBe(0);
    const dup = ralphy(["workspace", "create", "dup"]);
    expect(dup.exitCode).not.toBe(0);
    expect(stderrErrorCode(dup.stderr)).toBe("E_ALREADY_EXISTS");
    const bad = ralphy(["workspace", "create", "Bad_Slug"]);
    expect(bad.exitCode).not.toBe(0);
    expect(stderrErrorCode(bad.stderr)).toBe("E_VALIDATION_FAILED");
  });

  test("legacy activeWorkspace config cannot override entity Workspace ownership", () => {
    const workspace = ralphy(["workspace", "create", "fogtown"]);
    expect(workspace.exitCode).toBe(0);
    const configPath = path.join(tmpRoot, ".ralphy", "config.json");
    const config = JSON.stringify({ activeWorkspace: "bogus-legacy-pointer" }, null, 2);
    fs.writeFileSync(configPath, config);

    const created = ralphy(["project", "create", "--id", "explicit-owner"]);

    expect(created.exitCode).toBe(0);
    expect(created.json.workspaceId).toBe(workspace.json.id);
    expect(created.json.slug).toBe("explicit-owner");
    expect(fs.readFileSync(configPath, "utf8")).toBe(config);
  });

  test("use/show refuse an unknown workspace", () => {
    const u = ralphy(["workspace", "use", "nope"]);
    expect(u.exitCode).not.toBe(0);
    expect(stderrErrorCode(u.stderr)).toBe("E_NOT_FOUND");
    const s = ralphy(["workspace", "show", "nope"]);
    expect(s.exitCode).not.toBe(0);
    expect(stderrErrorCode(s.stderr)).toBe("E_NOT_FOUND");
  });

  test("updates Workspace rows optimistically and owns public account identities", () => {
    const created = ralphy(["workspace", "create", "acme", "--name", "Acme"]);
    expect(created.exitCode).toBe(0);
    const updated = ralphy([
      "workspace",
      "update",
      created.json.id,
      "--name",
      "Acme Media",
      "--slug",
      "acme-media",
      "--expected",
      String(created.json.rowVersion),
    ]);
    expect(updated.exitCode).toBe(0);
    expect(updated.json).toMatchObject({
      id: created.json.id,
      name: "Acme Media",
      slug: "acme-media",
      rowVersion: created.json.rowVersion + 1,
    });

    const stale = ralphy([
      "workspace",
      "update",
      created.json.id,
      "--name",
      "Stale",
      "--expected",
      String(created.json.rowVersion),
    ]);
    expect(stale.exitCode).toBe(2);
    expect(stderrErrorCode(stale.stderr)).toBe("E_CONFLICT");

    const account = ralphy([
      "workspace",
      "account",
      created.json.id,
      "--platform",
      "telegram",
      "--external-id",
      "channel-1",
      "--display-name",
      "Acme Media",
      "--username",
      "acme",
    ]);
    expect(account.exitCode).toBe(0);
    expect(account.json).toMatchObject({
      workspaceId: created.json.id,
      platform: "telegram",
      externalId: "channel-1",
      username: "acme",
      credentialConfigured: false,
    });
    expect(JSON.stringify(account.json)).not.toContain("credentialRef");
  });

  test("transfer refuses an unknown target Workspace", () => {
    const workspace = ralphy(["workspace", "create", "source"]);
    const project = ralphy(["project", "create", "--id", "p-001"]);
    expect(workspace.exitCode).toBe(0);
    expect(project.exitCode).toBe(0);
    const m = ralphy([
      "project",
      "transfer",
      project.json.id,
      "--to",
      "nope",
      "--expected",
      String(project.json.rowVersion),
    ]);
    expect(m.exitCode).not.toBe(0);
    expect(stderrErrorCode(m.stderr)).toBe("E_NOT_FOUND");
  });
});

describe("workspace verbs on a legacy root fail fast (#106)", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(tmpRoot, "workspace", ".ralph"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "legacy-001"), { recursive: true });
  });

  test("every workspace verb (and legacy project move) refuses with E_LEGACY_LAYOUT", () => {
    for (const args of [
      ["workspace", "list"],
      ["workspace", "show", "default"],
      ["workspace", "create", "foo"],
      ["workspace", "use", "default"],
      ["project", "move", "legacy-001", "foo"],
    ]) {
      const r = ralphy(args);
      expect(r.exitCode).not.toBe(0);
      expect(stderrErrorCode(r.stderr)).toBe("E_LEGACY_LAYOUT");
    }
  });
});
