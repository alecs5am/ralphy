// Integration smoke for the #108 workspace verbs:
//   ralphy workspace create | list | show | use
//   ralphy project move <id> <ws>
//
// Round-trip on a fresh temp root (→ the new ".ralphy" layout) plus the
// #106 fail-fast contract: EVERY workspace verb (and project move) refuses a
// legacy workspace/ root with E_LEGACY_LAYOUT until `ralphy migrate` runs.

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

describe("ralphy workspace create/list/show/use + project move (#108)", () => {
  test("create → list → use → project create → move round-trip", () => {
    // create
    const c = ralphy(["workspace", "create", "fogtown", "--name", "Fog Town", "--description", "horror universe"]);
    expect(c.exitCode).toBe(0);
    expect(c.json.slug).toBe("fogtown");
    expect(c.json.name).toBe("Fog Town");
    const wsDir = path.join(tmpRoot, ".ralphy", "workspaces", "fogtown");
    expect(fs.existsSync(path.join(wsDir, "workspace.json"))).toBe(true);
    for (const sub of [
      "shared",
      "shared/assets/images",
      "shared/assets/videos",
      "shared/assets/voiceover",
      "shared/assets/music",
      "shared/assets/sfx",
      "shared/assets/fonts",
      "projects",
      "templates",
      "batches",
      "logs",
      "units",
    ]) {
      expect(fs.existsSync(path.join(wsDir, sub))).toBe(true);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(wsDir, "workspace.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Fog Town", slug: "fogtown", description: "horror universe" });
    expect(typeof manifest.created).toBe("string");
    expect(manifest.profile.displayName).toBe("Fog Town");

    // list
    const l = ralphy(["workspace", "list"]);
    expect(l.exitCode).toBe(0);
    expect(Array.isArray(l.json)).toBe(true);
    const row = l.json.find((w: any) => w.slug === "fogtown");
    expect(row).toMatchObject({ slug: "fogtown", name: "Fog Town", projects: 0 });

    // use
    const u = ralphy(["workspace", "use", "fogtown"]);
    expect(u.exitCode).toBe(0);
    expect(u.json.activeWorkspace).toBe("fogtown");

    // project create lands in the active workspace + registry carries it
    const p = ralphy(["project", "create", "--id", "reel-001"]);
    expect(p.exitCode).toBe(0);
    expect(p.json.workspace).toBe("fogtown");
    expect(fs.existsSync(path.join(wsDir, "projects", "reel-001"))).toBe(true);

    // show reflects the project
    const s = ralphy(["workspace", "show", "fogtown"]);
    expect(s.exitCode).toBe(0);
    expect(s.json.projects).toEqual(["reel-001"]);
    expect(s.json.active).toBe(true);

    // move to a second workspace
    expect(ralphy(["workspace", "create", "archive"]).exitCode).toBe(0);
    const m = ralphy(["project", "move", "reel-001", "archive"]);
    expect(m.exitCode).toBe(0);
    expect(m.json.moved).toBe(true);
    expect(fs.existsSync(path.join(wsDir, "projects", "reel-001"))).toBe(false);
    expect(
      fs.existsSync(path.join(tmpRoot, ".ralphy", "workspaces", "archive", "projects", "reel-001")),
    ).toBe(true);
    const reg = JSON.parse(fs.readFileSync(path.join(tmpRoot, ".ralphy", "registry.json"), "utf8"));
    expect(reg.projects["reel-001"].workspace).toBe("archive");

    // project show still resolves the moved project by bare id
    const ps = ralphy(["project", "show", "reel-001"]);
    expect(ps.exitCode).toBe(0);
    expect(ps.json.id).toBe("reel-001");
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

  test("use/show refuse an unknown workspace", () => {
    const u = ralphy(["workspace", "use", "nope"]);
    expect(u.exitCode).not.toBe(0);
    expect(stderrErrorCode(u.stderr)).toBe("E_NOT_FOUND");
    const s = ralphy(["workspace", "show", "nope"]);
    expect(s.exitCode).not.toBe(0);
    expect(stderrErrorCode(s.stderr)).toBe("E_NOT_FOUND");
  });

  test("updates account profile and public channel identities", () => {
    expect(ralphy(["workspace", "create", "acme", "--name", "Acme"]).exitCode).toBe(0);
    const updated = ralphy([
      "workspace",
      "update",
      "acme",
      "--display-name",
      "Acme Media",
      "--bio",
      "Practical engineering notes",
      "--language",
      "English",
      "--timezone",
      "Europe/London",
      "--telegram",
      "@acme",
      "--x",
      "@acme_dev",
      "--devto",
      "acme",
    ]);
    expect(updated.exitCode).toBe(0);
    expect(updated.json.profile).toMatchObject({
      displayName: "Acme Media",
      bio: "Practical engineering notes",
      language: "English",
      timezone: "Europe/London",
    });
    expect(updated.json.channels).toMatchObject({
      telegram: { handle: "@acme" },
      x: { handle: "@acme_dev" },
      devto: { handle: "acme" },
    });
  });

  test("move refuses an unknown target workspace", () => {
    expect(ralphy(["project", "create", "--id", "p-001"]).exitCode).toBe(0);
    const m = ralphy(["project", "move", "p-001", "nope"]);
    expect(m.exitCode).not.toBe(0);
    expect(stderrErrorCode(m.stderr)).toBe("E_NOT_FOUND");
  });
});

describe("workspace verbs on a legacy root fail fast (#106)", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(tmpRoot, "workspace", ".ralph"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "legacy-001"), { recursive: true });
  });

  test("every workspace verb (and project move) refuses with E_LEGACY_LAYOUT", () => {
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
