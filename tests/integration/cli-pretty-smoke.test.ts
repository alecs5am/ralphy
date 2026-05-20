// Pretty-mode CLI smoke tests.
//
// Every integration test in tests/integration/ spawns `bun cli/index.ts`
// without a TTY, which forces JSON mode. That's appropriate for shape
// assertions, but it means the pretty pipeline (cli/lib/output.ts +
// cli/lib/ui.ts) had zero CLI-level coverage. The `installed [object Object]`
// regression slipped through because of that gap.
//
// This file runs a curated list of safe-to-invoke verbs with `--pretty` and
// asserts the rendered output contains no `[object Object]`, no bare
// `undefined`, no JSON-escape leakage. It is intentionally lightweight — one
// invariant per verb, no snapshot churn. The deeper per-verb coverage lives
// in notes/issues/001-cli-pretty-mode-untested.md.

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function ralphyPretty(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync("bun", ["run", CLI, "--pretty", ...args], {
    cwd: opts.cwd ?? REPO,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  return {
    exitCode: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function assertCleanPretty(verb: string, out: string, code: number) {
  const text = stripAnsi(out);
  if (code !== 0) {
    // Non-zero exit may emit an error frame; still assert no [object Object].
    expect(text, `[${verb}] non-zero exit emitted [object Object]`).not.toContain("[object Object]");
    return;
  }
  expect(text, `[${verb}] contains [object Object]`).not.toContain("[object Object]");
  expect(text, `[${verb}] contains standalone undefined cell`).not.toMatch(/[\s││|]undefined[\s││|]/);
  expect(text, `[${verb}] contains JSON-escape leakage`).not.toMatch(/\\"[a-z_]+\\":/);
}

// ─── Safe-to-invoke verbs (no API keys, no network, no project context) ───

describe("ralphy pretty-mode smoke — safe verbs", () => {
  // Use an empty tmp dir so project auto-detect doesn't pick up an in-flight
  // workspace and pollute the output.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-pretty-smoke-"));

  test("ralphy --pretty (bare dashboard)", () => {
    const r = ralphyPretty([], { cwd: tmp });
    assertCleanPretty("(bare)", r.stdout, r.exitCode);
  });

  test("ralphy -p models list", () => {
    const r = ralphyPretty(["models", "list"], { cwd: tmp });
    assertCleanPretty("models list", r.stdout, r.exitCode);
  });

  test("ralphy -p template list", () => {
    const r = ralphyPretty(["template", "list"], { cwd: tmp });
    assertCleanPretty("template list", r.stdout, r.exitCode);
  });

  test("ralphy -p skill list", () => {
    const r = ralphyPretty(["skill", "list"], { cwd: tmp });
    assertCleanPretty("skill list", r.stdout, r.exitCode);
  });

  test("ralphy -p config list", () => {
    const r = ralphyPretty(["config", "list"], { cwd: tmp, env: { HOME: tmp } });
    assertCleanPretty("config list", r.stdout, r.exitCode);
  });

  test("ralphy -p prompts library lookup --goal 'saas hook'", () => {
    const r = ralphyPretty(["prompts", "library", "lookup", "--goal", "saas hook"], { cwd: tmp });
    assertCleanPretty("prompts library lookup", r.stdout, r.exitCode);
  });

  test("ralphy -p ref check _ --text 'Old Spice ad'", () => {
    const r = ralphyPretty(["ref", "check", "_", "--text", "Old Spice ad"], { cwd: tmp });
    assertCleanPretty("ref check", r.stdout, r.exitCode);
  });
});

// ─── Verbs that emit array-of-objects shapes (regression front) ───────────
//
// The original `installed  [object Object]` bug came from `ralphy skill
// install --agent claude`. That verb writes to ~/.claude in user scope, so a
// sandboxed integration test would need to relocate that scope reliably,
// which is more plumbing than this smoke layer wants to own. The shape itself
// (`{ installed: [{ ok, agent, scope, installed: [...] }] }`) is covered by
// the unit test in tests/unit/output-pretty.test.ts. The random-shape
// invariants live in tests/unit/output-pretty-fuzz.test.ts.
