// Integration tests for the #049 small-utility-verbs cluster:
//   - `ralphy project create --kind image-pack` (no scenes/scenario scaffold)
//   - `ralphy project thumbnail <id> --at <t>` (single-frame extract)
//   - `ralphy project zip <id> --selected` (handoff bundle)
//   - `ralphy brand extract <svg>` (SVG layer report)
//
// Each test stands up a fresh tmp workspace + RALPHY_HOME so the registry +
// projectsDir resolve cleanly.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-049-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: unknown } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: tmpRoot,
      RALPHY_HOME: tmpRoot,
      RALPHY_SKIP_LEGACY_HINT: "1",
      NO_COLOR: "1",
    },
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

describe("ralphy project create --kind image-pack (#049)", () => {
  test("scaffolds images + selected + refs; no scenes / scenario", () => {
    const r = ralphy(["project", "create", "--id", "ip-001", "--kind", "image-pack"]);
    expect(r.exitCode).toBe(0);
    const dir = path.join(tmpRoot, "workspace", "projects", "ip-001");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, "assets", "images"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "selected"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "refs"))).toBe(true);
    // image-pack does NOT pre-create the video-shaped scaffold.
    expect(fs.existsSync(path.join(dir, "assets", "videos"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "assets", "voiceover"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "render"))).toBe(false);
    // The kind field is persisted on the registry entry.
    const j = r.json as { kind?: string };
    expect(j.kind).toBe("image-pack");
  });

  test("default --kind=video keeps the existing scaffold", () => {
    const r = ralphy(["project", "create", "--id", "v-001"]);
    expect(r.exitCode).toBe(0);
    const dir = path.join(tmpRoot, "workspace", "projects", "v-001");
    expect(fs.existsSync(path.join(dir, "assets", "videos"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "assets", "voiceover"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "render"))).toBe(true);
    const j = r.json as { kind?: string };
    expect(j.kind).toBe("video");
  });

  test("unknown --kind → E_VALIDATION_FAILED", () => {
    const r = ralphy(["project", "create", "--id", "bad-001", "--kind", "garbage"]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_VALIDATION_FAILED");
  });
});

describe("ralphy project thumbnail (#049)", () => {
  test("E_VALIDATION_FAILED on a non-numeric --at", () => {
    ralphy(["project", "create", "--id", "thumb-001"]);
    const r = ralphy(["project", "thumbnail", "thumb-001", "--at", "not-a-number"]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_VALIDATION_FAILED");
  });

  test("--help advertises the --at flag", () => {
    const r = ralphy(["project", "thumbnail", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("--at");
  });
});

describe("ralphy project zip --selected (#049)", () => {
  test("zips the <project>/selected/ dir into <cwd>/<id>.zip", () => {
    const cr = ralphy(["project", "create", "--id", "zip-001", "--kind", "image-pack"]);
    expect(cr.exitCode).toBe(0);
    const selDir = path.join(tmpRoot, "workspace", "projects", "zip-001", "selected");
    fs.writeFileSync(path.join(selDir, "a.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(selDir, "b.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const r = ralphy(["project", "zip", "zip-001", "--selected"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project: string; mode: string; out: string; bytes: number };
    expect(j.project).toBe("zip-001");
    expect(j.mode).toBe("selected");
    expect(fs.existsSync(j.out)).toBe(true);
    expect(j.bytes).toBeGreaterThan(0);
  });

  test("refuses without --selected or --all", () => {
    ralphy(["project", "create", "--id", "zip-002"]);
    const r = ralphy(["project", "zip", "zip-002"]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_VALIDATION_FAILED");
  });
});

describe("ralphy brand extract <svg> (#049)", () => {
  test("emits a JSON layer report with the warning catalog", () => {
    const svgPath = path.join(tmpRoot, "logo.svg");
    fs.writeFileSync(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#fff"/>
        <path d="M10 10 L90 10 L90 90 L10 90 Z M30 30 L70 30 L70 70 L30 70 Z" fill="#000"/>
      </svg>`,
    );
    const r = ralphy(["brand", "extract", svgPath]);
    expect(r.exitCode).toBe(0);
    const j = r.json as {
      shapeCount: number;
      compoundPathCount: number;
      overlayRectCount: number;
      warnings: string[];
    };
    expect(j.shapeCount).toBe(2);
    expect(j.compoundPathCount).toBe(1);
    expect(j.overlayRectCount).toBe(1);
    expect(j.warnings.some((w) => w.includes("fill-rule"))).toBe(true);
  });

  test("missing file → E_FILE_UNREADABLE", () => {
    const r = ralphy(["brand", "extract", "/nope/missing.svg"]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_FILE_UNREADABLE");
  });
});
