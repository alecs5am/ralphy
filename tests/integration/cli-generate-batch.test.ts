// CLI integration tests for `generate image --batch / --variants / image-batch`
// (#024). All paths run --dry-run so no network round-trip happens; the
// JSON shape contract covers the slot-naming + cost-rollup logic end-to-end.
//
// The "live submit" side of the batch fan-out is exercised by the unit tests
// in tests/unit/generate-batch.test.ts (the pure parsers/builders) and by the
// existing tests/integration/provider-retry-transient.test.ts which exercises
// the per-endpoint concurrency semaphore that the batch fan-out relies on.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FIXTURE = path.join(REPO, "tests", "fixtures", "or-catalog.json");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-batch-024-"));
  fs.mkdirSync(path.join(tmp, "workspace", ".ralph"), { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(tmp, "workspace", ".ralph", "or-catalog.json"));
  const proj = path.join(tmp, "workspace", "projects", "batch-001");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "BRIEF.md"), "batch fan-out test project\n");
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* ok */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

describe("generate image --variants N --dry-run (#024)", () => {
  test("prints expected cost rollup + N variant slots", () => {
    const r = ralphy([
      "generate", "image",
      "--project", "batch-001",
      "--slot", "hero",
      "--prompt", "a hero shot",
      "--variants", "3",
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
    expect(r.json?.mode).toBe("batch");
    expect(r.json?.count).toBe(3);
    expect(r.json?.model).toBe("google/gemini-3-pro-image-preview");
    // Three nominal gemini-3-pro-image-preview calls @ $0.04 each.
    expect(r.json?.cost_estimate_usd).toBeCloseTo(0.12, 3);
    expect(r.json?.eta_seconds).toBeGreaterThan(0);
    const slots = (r.json?.items as Array<{ slot: string }>).map((it) => it.slot);
    expect(slots).toEqual(["hero-v1", "hero-v2", "hero-v3"]);
  });
});

describe("generate image --batch <jsonl> --dry-run (#024)", () => {
  test("parses jsonl + emits per-line dry-run", () => {
    const jsonl = path.join(tmp, "prompts.jsonl");
    fs.writeFileSync(
      jsonl,
      [
        "# header comment",
        `{"slot": "scene-01", "prompt": "a sunrise"}`,
        `{"slot": "scene-02", "prompt": "a sunset", "model": "openai/gpt-5.4-image-2"}`,
        `{"slot": "scene-03", "prompt": "a moon"}`,
      ].join("\n"),
    );
    const r = ralphy([
      "generate", "image",
      "--project", "batch-001",
      "--batch", jsonl,
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
    expect(r.json?.count).toBe(3);
    const slots = (r.json?.items as Array<{ slot: string; model: string }>);
    expect(slots.map((s) => s.slot)).toEqual(["scene-01", "scene-02", "scene-03"]);
    // Per-line --model override surfaces in the rollup.
    expect(slots[1]?.model).toBe("openai/gpt-5.4-image-2");
    expect(slots[0]?.model).toBe("google/gemini-3-pro-image-preview");
    expect(r.json?.cost_estimate_usd).toBeGreaterThan(0);
  });

  test("rejects an empty batch jsonl with E_INPUT_INVALID", () => {
    const jsonl = path.join(tmp, "empty.jsonl");
    fs.writeFileSync(jsonl, "# only comments\n");
    const r = ralphy([
      "generate", "image",
      "--project", "batch-001",
      "--batch", jsonl,
      "--dry-run",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_INPUT_INVALID/u);
  });

  test("rejects malformed jsonl with a line-numbered error", () => {
    const jsonl = path.join(tmp, "bad.jsonl");
    fs.writeFileSync(jsonl, `{"slot":"ok","prompt":"x"}\nnot-json-here\n`);
    const r = ralphy([
      "generate", "image",
      "--project", "batch-001",
      "--batch", jsonl,
      "--dry-run",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/line 2/u);
  });
});

describe("generate image-batch --prompts-dir <dir> --dry-run (#024)", () => {
  test("each *.txt becomes a slot named by stem", () => {
    const dir = path.join(tmp, "prompts");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "scene-01.txt"), "first prompt\n");
    fs.writeFileSync(path.join(dir, "scene-02.txt"), "second prompt\n");
    fs.writeFileSync(path.join(dir, "scene-03.txt"), "third prompt\n");
    fs.writeFileSync(path.join(dir, "README.md"), "ignored\n");

    const r = ralphy([
      "generate", "image-batch",
      "--project", "batch-001",
      "--prompts-dir", dir,
      "--dry-run",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.dryRun).toBe(true);
    expect(r.json?.count).toBe(3);
    const slots = (r.json?.items as Array<{ slot: string }>).map((it) => it.slot);
    expect(slots).toEqual(["scene-01", "scene-02", "scene-03"]);
    // 3 × gemini-3-pro-image-preview @ $0.04 each.
    expect(r.json?.cost_estimate_usd).toBeCloseTo(0.12, 3);
  });

  test("rejects a directory with no *.txt files", () => {
    const dir = path.join(tmp, "no-prompts");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "notes.md"), "no prompts\n");
    const r = ralphy([
      "generate", "image-batch",
      "--project", "batch-001",
      "--prompts-dir", dir,
      "--dry-run",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_INPUT_INVALID/u);
  });

  test("rejects a missing --prompts-dir", () => {
    const r = ralphy([
      "generate", "image-batch",
      "--project", "batch-001",
      "--prompts-dir", path.join(tmp, "does-not-exist"),
      "--dry-run",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_FILE_UNREADABLE/u);
  });
});

describe("generate image --slot omitted without --batch is rejected (#024)", () => {
  test("E_INPUT_INVALID names the slot field", () => {
    const r = ralphy([
      "generate", "image",
      "--project", "batch-001",
      "--prompt", "x",
      "--dry-run",
    ]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/E_INPUT_INVALID/u);
    expect(r.stderr).toMatch(/slot/u);
  });
});
