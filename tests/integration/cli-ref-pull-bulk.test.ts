// Integration test for `ralphy ref pull --from-file <urls.txt> --kind reference-image`
// (#048). Spins up a localhost HTTP fixture server and dispatches the CLI at it.

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { spawnCli, type CliResult } from "../helpers/spawn-cli.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let server: Server;
let port = 0;
let tmpRoot: string;

// Tiny synthetic PNGs (1×1 px each, distinct content per route).
function tinyPng(seed: number): Buffer {
  // 1×1 PNG produced by ffmpeg-less constant assembly. Same width × height
  // signature for each; only the IDAT payload changes via `seed`.
  // Easier path: just return a content-typed unique buffer — we don't actually
  // need it to be a valid image, the CLI doesn't validate the body.
  return Buffer.from(`png-bytes-seed-${seed}-`.repeat(8));
}

beforeAll(() => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/a/b/foo.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(tinyPng(1));
      return;
    }
    if (url === "/c/bar.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(tinyPng(2));
      return;
    }
    if (url === "/dup.png") {
      // Same body as /a/b/foo.png → exercises sha256 dedupe.
      res.writeHead(200, { "content-type": "image/png" });
      res.end(tinyPng(1));
      return;
    }
    if (url === "/no-ext-but-typed") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(tinyPng(3));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) port = addr.port;
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

// Async spawn (not spawnSync): on bun 1.3.x spawnSync blocks the parent event
// loop, deadlocking the in-process fixture server above (#072).
function ralphy(args: string[]): Promise<CliResult> {
  return spawnCli([CLI, "--cwd", tmpRoot, ...args], { cwd: tmpRoot });
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-bulk-pull-"));
  // Minimal workspace + project registry.
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-bulk-001"), { recursive: true });
  const registry = {
    projects: {
      "test-bulk-001": {
        id: "test-bulk-001",
        name: "Bulk pull fixture",
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
    path.join(tmpRoot, ".ralphy", "registry.json"),
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

describe("`ralphy ref pull --from-file --kind reference-image` (#048)", () => {
  test("downloads every URL into <project>/artifacts/refs/ with domain-prefixed names", async () => {
    const urlsFile = path.join(tmpRoot, "urls.txt");
    fs.writeFileSync(
      urlsFile,
      [
        "# brand refs",
        `http://127.0.0.1:${port}/a/b/foo.png`,
        `http://127.0.0.1:${port}/c/bar.jpg`,
        "",
      ].join("\n"),
    );

    const r = await ralphy([
      "ref",
      "pull",
      "--from-file",
      urlsFile,
      "--kind",
      "reference-image",
      "--project",
      "test-bulk-001",
    ]);
    if (r.exitCode !== 0) {
      console.error("stderr:", r.stderr);
      console.error("stdout:", r.stdout);
    }
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    expect(r.json.total).toBe(2);
    expect(r.json.downloaded).toBe(2);
    expect(r.json.errored).toBe(0);

    const refsDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-bulk-001", "artifacts", "refs");
    const files = fs.readdirSync(refsDir).sort();
    expect(files).toContain("127.0.0.1-foo.png");
    expect(files).toContain("127.0.0.1-bar.jpg");
  });

  test("dedupes by sha256 within a single batch", async () => {
    const r = await ralphy([
      "ref",
      "pull",
      `http://127.0.0.1:${port}/a/b/foo.png`,
      `http://127.0.0.1:${port}/dup.png`,
      "--kind",
      "reference-image",
      "--project",
      "test-bulk-001",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json.total).toBe(2);
    // One downloaded, the duplicate sha256 → skipped.
    expect(r.json.downloaded).toBe(1);
    expect(r.json.skipped).toBe(1);
    const refsDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-bulk-001", "artifacts", "refs");
    const files = fs.readdirSync(refsDir);
    expect(files.length).toBe(1);
  });

  test("idempotent: re-running on the same URL is a skipped-existing no-op", async () => {
    const url = `http://127.0.0.1:${port}/a/b/foo.png`;
    await ralphy(["ref", "pull", url, "--kind", "reference-image", "--project", "test-bulk-001"]);
    const r2 = await ralphy(["ref", "pull", url, "--kind", "reference-image", "--project", "test-bulk-001"]);
    expect(r2.exitCode).toBe(0);
    expect(r2.json.downloaded).toBe(0);
    expect(r2.json.skipped).toBe(1);
    const refsDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-bulk-001", "artifacts", "refs");
    expect(fs.readdirSync(refsDir).length).toBe(1);
  });

  test("appends gen-log rows with provider='http' + cost_usd=0", async () => {
    await ralphy([
      "ref",
      "pull",
      `http://127.0.0.1:${port}/a/b/foo.png`,
      "--kind",
      "reference-image",
      "--project",
      "test-bulk-001",
    ]);
    const log = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "test-bulk-001",
      "logs",
      "generations.jsonl",
    );
    expect(fs.existsSync(log)).toBe(true);
    const rows = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const last = rows[rows.length - 1];
    expect(last.provider).toBe("http");
    expect(last.endpoint).toBe("ref-pull-bulk");
    expect(last.cost_usd).toBe(0);
    expect(last.input.url).toBe(`http://127.0.0.1:${port}/a/b/foo.png`);
    expect(last.input.project).toBe("test-bulk-001");
  });

  test("infers extension from content-type when URL has no extension", async () => {
    const r = await ralphy([
      "ref",
      "pull",
      `http://127.0.0.1:${port}/no-ext-but-typed`,
      "--kind",
      "reference-image",
      "--project",
      "test-bulk-001",
    ]);
    expect(r.exitCode).toBe(0);
    const refsDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-bulk-001", "artifacts", "refs");
    const files = fs.readdirSync(refsDir);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  });

  test("missing --project raises E_INPUT_INVALID", async () => {
    const r = await ralphy([
      "ref",
      "pull",
      `http://127.0.0.1:${port}/a/b/foo.png`,
      "--kind",
      "reference-image",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect((r.stdout + r.stderr).toLowerCase()).toContain("project");
  });
});

// Sanity: hash mismatch between fixtures is real (so sha256 dedupe is actually
// dedupe-by-content, not accidental basename dedupe).
test("fixtures: tinyPng(1) and tinyPng(2) hash differently", () => {
  const h1 = createHash("sha256").update(tinyPng(1)).digest("hex");
  const h2 = createHash("sha256").update(tinyPng(2)).digest("hex");
  expect(h1).not.toBe(h2);
});
