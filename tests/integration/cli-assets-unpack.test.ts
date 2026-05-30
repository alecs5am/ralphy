// Integration test for `ralphy assets unpack <zip>` (#048). Builds a fixture
// zip with the brand-zip shape (nested dirs, __MACOSX/, .DS_Store) and dispatches
// the CLI at it.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function hasZipTools(): boolean {
  const a = spawnSync("zip", ["-v"], { stdio: "ignore" }).status;
  const b = spawnSync("unzip", ["-v"], { stdio: "ignore" }).status;
  return a === 0 && b === 0;
}

const HAS_ZIP = hasZipTools();

let tmpRoot: string;

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", [CLI, "--cwd", tmpRoot, ...args], {
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-assets-unpack-"));
  fs.mkdirSync(path.join(tmpRoot, "workspace", ".ralph"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "test-zip-001"), { recursive: true });
  const registry = {
    projects: {
      "test-zip-001": {
        id: "test-zip-001",
        name: "Zip unpack fixture",
        brief: "test",
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
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function makeFixtureZip(): string {
  // Build the fixture brand-pack:
  //   Brand Pack/Logos/Primary.svg
  //   Brand Pack/Icons/Primary.svg     ← same basename, different sub-dir
  //   Brand Pack/Colors/Tokens.json
  //   Brand Pack/.DS_Store             ← must be filtered
  //   __MACOSX/Brand Pack/._Primary.svg ← must be filtered
  const src = path.join(tmpRoot, "src");
  fs.mkdirSync(path.join(src, "Brand Pack/Logos"), { recursive: true });
  fs.mkdirSync(path.join(src, "Brand Pack/Icons"), { recursive: true });
  fs.mkdirSync(path.join(src, "Brand Pack/Colors"), { recursive: true });
  fs.mkdirSync(path.join(src, "__MACOSX/Brand Pack"), { recursive: true });
  fs.writeFileSync(path.join(src, "Brand Pack/Logos/Primary.svg"), "<svg>logo</svg>");
  fs.writeFileSync(path.join(src, "Brand Pack/Icons/Primary.svg"), "<svg>icon</svg>");
  fs.writeFileSync(
    path.join(src, "Brand Pack/Colors/Tokens.json"),
    JSON.stringify({ primary: "#0066ff" }),
  );
  fs.writeFileSync(path.join(src, "Brand Pack/.DS_Store"), "junk");
  fs.writeFileSync(path.join(src, "__MACOSX/Brand Pack/._Primary.svg"), "resource-fork");

  const zipPath = path.join(tmpRoot, "brand.zip");
  spawnSync("zip", ["-r", zipPath, "."], { cwd: src, stdio: "ignore" });
  return zipPath;
}

describe("`ralphy assets unpack` (#048)", () => {
  test("flattens to <project>/brand/, drops __MACOSX/ + .DS_Store, kebab names", () => {
    if (!HAS_ZIP) {
      console.warn("`zip`/`unzip` missing — skipping assets unpack integration test");
      return;
    }
    const zipPath = makeFixtureZip();
    const r = ralphy(["assets", "unpack", zipPath, "--project", "test-zip-001"]);
    if (r.exitCode !== 0) {
      console.error("stderr:", r.stderr);
      console.error("stdout:", r.stdout);
    }
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    expect(r.json.unpacked).toBe(3);

    const brandDir = path.join(tmpRoot, "workspace", "projects", "test-zip-001", "brand");
    const landed = fs.readdirSync(brandDir).sort();
    // .DS_Store and ._Primary.svg must be absent.
    expect(landed).not.toContain(".DS_Store");
    expect(landed.every((n) => !n.startsWith("._"))).toBe(true);
    // No __MACOSX dir should have been created.
    expect(landed).not.toContain("__MACOSX");
    // Both Primary.svg variants land under sub-dir prefixed kebab names.
    expect(landed).toContain("logos-primary.svg");
    expect(landed).toContain("icons-primary.svg");
    expect(landed).toContain("colors-tokens.json");
  });

  test("appends a gen-log row with endpoint='assets-unpack' + cost_usd=0", () => {
    if (!HAS_ZIP) return;
    const zipPath = makeFixtureZip();
    ralphy(["assets", "unpack", zipPath, "--project", "test-zip-001"]);
    const log = path.join(
      tmpRoot,
      "workspace",
      "projects",
      "test-zip-001",
      "logs",
      "generations.jsonl",
    );
    expect(fs.existsSync(log)).toBe(true);
    const rows = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const row = rows[rows.length - 1];
    expect(row.endpoint).toBe("assets-unpack");
    expect(row.cost_usd).toBe(0);
    expect(row.input.project).toBe("test-zip-001");
  });

  test("missing --project errors", () => {
    if (!HAS_ZIP) return;
    const zipPath = makeFixtureZip();
    const r = ralphy(["assets", "unpack", zipPath]);
    expect(r.exitCode).not.toBe(0);
  });

  test("idempotent: re-running on the same zip is a no-op (no duplicate files)", () => {
    if (!HAS_ZIP) return;
    const zipPath = makeFixtureZip();
    ralphy(["assets", "unpack", zipPath, "--project", "test-zip-001"]);
    const brandDir = path.join(tmpRoot, "workspace", "projects", "test-zip-001", "brand");
    const before = fs.readdirSync(brandDir).sort();
    ralphy(["assets", "unpack", zipPath, "--project", "test-zip-001"]);
    const after = fs.readdirSync(brandDir).sort();
    expect(after).toEqual(before);
  });
});
