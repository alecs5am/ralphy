// Integration: `ralphy project log-asset --copy-from` (issue #038).
//
// macOS NSIRD screenshot paths auto-delete within minutes. `--copy-from`
// rescues the bytes into <project>/refs/<basename> and logs BOTH paths so
// downstream readers can find the file after the source has evaporated.
//
// Invariants verified here:
//   1. `--copy-from` copies the file into refs/ AND logs both originalPath +
//      localPath in user-assets.jsonl.
//   2. Disposable-looking source path WITHOUT `--copy-from` emits a stderr warning.
//   3. Same basename + same sha256 → idempotent no-op (no second copy).
//   4. Same basename + different sha256 → numeric suffix on the new file;
//      original is never overwritten (AGENTS.md invariant #14).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

function ralphy(args: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: any;
} {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
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

function createProject(id: string): void {
  const r = ralphy(["project", "create", "--name", id, "--id", id]);
  expect(r.exitCode).toBe(0);
}

function readAssetLog(id: string): any[] {
  const fp = path.join(tmpRoot, "workspace", "projects", id, "logs", "user-assets.jsonl");
  if (!fs.existsSync(fp)) return [];
  return fs
    .readFileSync(fp, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-log-asset-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("`ralphy project log-asset --copy-from` (#038)", () => {
  test("copies the file into <project>/refs/ and logs both paths", () => {
    createProject("p1");

    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-src-"));
    const srcFile = path.join(srcDir, "ref.png");
    fs.writeFileSync(srcFile, "hello-bytes");

    const r = ralphy([
      "project",
      "log-asset",
      "p1",
      "--kind",
      "screenshot",
      "--source",
      srcFile,
      "--copy-from",
      srcFile,
    ]);
    expect(r.exitCode).toBe(0);

    const dest = path.join(tmpRoot, "workspace", "projects", "p1", "refs", "ref.png");
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, "utf8")).toBe("hello-bytes");

    const rows = readAssetLog("p1");
    expect(rows.length).toBe(1);
    expect(rows[0].originalPath).toBe(srcFile);
    expect(rows[0].localPath).toBe(dest);
    expect(rows[0].dest).toBe(dest);

    fs.rmSync(srcDir, { recursive: true, force: true });
  });

  test("disposable source path WITHOUT --copy-from emits a stderr warning", () => {
    createProject("p2");

    // Simulate the macOS NSIRD screenshot pattern in the source string only —
    // the file doesn't need to exist on disk for log-asset to log the path.
    const fakeDisposable =
      "/var/folders/abc/T/TemporaryItems/NSIRD_screencaptureui_X/Screenshot 2026-05-29 at 12.00.00.png";
    const r = ralphy([
      "project",
      "log-asset",
      "p2",
      "--kind",
      "screenshot",
      "--source",
      fakeDisposable,
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("disposable");
    expect(r.stderr).toContain("--copy-from");

    const rows = readAssetLog("p2");
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe(fakeDisposable);
    expect(rows[0].localPath).toBeUndefined();
  });

  test("same basename + same sha256 is idempotent (no second copy)", () => {
    createProject("p3");

    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-src-"));
    const srcFile = path.join(srcDir, "idem.png");
    fs.writeFileSync(srcFile, "same-bytes");

    const argsFor = (n: number) => [
      "project",
      "log-asset",
      "p3",
      "--kind",
      "screenshot",
      "--source",
      srcFile,
      "--copy-from",
      srcFile,
      "--note",
      `call-${n}`,
    ];

    const r1 = ralphy(argsFor(1));
    expect(r1.exitCode).toBe(0);
    const r2 = ralphy(argsFor(2));
    expect(r2.exitCode).toBe(0);

    // Only one physical file in refs/ — same name, same sha → skip.
    const refsDir = path.join(tmpRoot, "workspace", "projects", "p3", "refs");
    const refs = fs.readdirSync(refsDir);
    expect(refs).toEqual(["idem.png"]);

    // Both log rows point at the same localPath.
    const rows = readAssetLog("p3");
    expect(rows.length).toBe(2);
    expect(rows[0].localPath).toBe(rows[1].localPath);
    // Second call should mention "skipped" in stderr.
    expect(r2.stderr.toLowerCase()).toContain("skipped");

    fs.rmSync(srcDir, { recursive: true, force: true });
  });

  test("same basename + DIFFERENT sha256 → numeric suffix, never overwrites", () => {
    createProject("p4");

    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-src-"));
    const a = path.join(srcDir, "collide.png");
    const b = path.join(srcDir, "collide.png.different");
    fs.writeFileSync(a, "AAA");
    fs.writeFileSync(b, "BBB");

    const r1 = ralphy([
      "project",
      "log-asset",
      "p4",
      "--kind",
      "screenshot",
      "--source",
      a,
      "--copy-from",
      a,
    ]);
    expect(r1.exitCode).toBe(0);

    // Stage second file UNDER the same target basename by renaming on the source side.
    const b2 = path.join(srcDir, "collide.png");
    fs.unlinkSync(a); // (we already copied AAA into refs/)
    fs.writeFileSync(b2, "BBB-different");

    const r2 = ralphy([
      "project",
      "log-asset",
      "p4",
      "--kind",
      "screenshot",
      "--source",
      b2,
      "--copy-from",
      b2,
    ]);
    expect(r2.exitCode).toBe(0);

    const refsDir = path.join(tmpRoot, "workspace", "projects", "p4", "refs");
    const files = fs.readdirSync(refsDir).sort();
    expect(files).toContain("collide.png");
    expect(files).toContain("collide-2.png");
    // Original "AAA" content is preserved (invariant #14).
    expect(fs.readFileSync(path.join(refsDir, "collide.png"), "utf8")).toBe("AAA");
    expect(fs.readFileSync(path.join(refsDir, "collide-2.png"), "utf8")).toBe("BBB-different");
    expect(r2.stderr.toLowerCase()).toContain("collision");

    const rows = readAssetLog("p4");
    expect(rows.length).toBe(2);
    expect(rows[1].localPath).toBe(path.join(refsDir, "collide-2.png"));

    fs.rmSync(srcDir, { recursive: true, force: true });
  });
});
