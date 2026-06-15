// NO_COLOR + force-pretty audit (issue #001 §D + §E).
//
// §D — ANSI-in-pipe: `--pretty` must respect NO_COLOR. When NO_COLOR is set
//      (any non-empty value), a `--pretty` run must emit ZERO raw ANSI escape
//      codes, even though pretty mode is forced. The preAction hook in
//      cli/index.ts forces chalk.level=0, sets NO_COLOR=1, and clears
//      FORCE_COLOR so transitive color libs (cli-table3 borders, ora) also
//      disable. Before this fix the realistic NO_COLOR pipe was already clean
//      via chalk auto-detection, but FORCE_COLOR could override it and table
//      borders leaked — this locks NO_COLOR as authoritative.
//
// §E — force-pretty: `--pretty` forces pretty output regardless of TTY
//      auto-detection. These tests spawn the CLI WITHOUT a TTY (spawnSync
//      pipes stdout), so the auto-detect branch would pick JSON. We assert
//      that `--pretty` overrides that and renders the human table/kv layout,
//      while the same verb WITHOUT `--pretty` renders JSON. The one path NOT
//      covered here is the raw "stdout IS a TTY" auto-detect branch, which
//      would require a node-pty harness — intentionally skipped (the issue
//      lists it as optional and we avoid the heavy dep).

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function ralphy(args: string[], opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  // Strip any inherited FORCE_COLOR / NO_COLOR so each test controls them
  // explicitly. Build a clean env, then layer the test's overrides on top.
  const baseEnv: Record<string, string | undefined> = { ...process.env };
  delete baseEnv.FORCE_COLOR;
  delete baseEnv.NO_COLOR;
  const env = { ...baseEnv, ...(opts.env ?? {}) };
  // node:child_process drops keys whose value is undefined.
  const r = spawnSync("bun", ["run", CLI, ...args], {
    cwd: opts.cwd ?? REPO,
    encoding: "utf8",
    env: env as Record<string, string>,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const ANSI = /\x1b\[[0-9;]*m/;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-nocolor-"));

// ─── §D — NO_COLOR is respected under --pretty ────────────────────────────

describe("ralphy --pretty respects NO_COLOR (#001 §D)", () => {
  // Cover both a kv-tree verb (config list) and a table verb (models list),
  // since cli-table3 borders are a separate color source from chalk content.
  const cases: Array<[string, string[], Record<string, string | undefined>]> = [
    ["config list", ["config", "list"], { HOME: tmp }],
    ["models list", ["models", "list"], {}],
    ["skill list", ["skill", "list"], {}],
    ["template list", ["template", "list"], {}],
    ["bare dashboard", [], {}],
  ];

  for (const [label, verb, extraEnv] of cases) {
    test(`NO_COLOR=1 + --pretty ${label} emits no ANSI`, () => {
      const r = ralphy(["--pretty", ...verb], { cwd: tmp, env: { NO_COLOR: "1", ...extraEnv } });
      expect(ANSI.test(r.stdout), `[${label}] leaked ANSI under NO_COLOR=1 --pretty`).toBe(false);
    });
  }

  test("NO_COLOR wins over FORCE_COLOR under --pretty (models list table borders)", () => {
    // The contrived FORCE_COLOR + NO_COLOR conflict: NO_COLOR must win for our
    // output. clearing FORCE_COLOR in the hook makes cli-table3 borders + chalk
    // content both drop color.
    const r = ralphy(["--pretty", "models", "list"], {
      cwd: tmp,
      env: { NO_COLOR: "1", FORCE_COLOR: "3" },
    });
    expect(ANSI.test(r.stdout), "leaked ANSI when NO_COLOR=1 but FORCE_COLOR=3 was also set").toBe(false);
  });

  test("piped --pretty (no NO_COLOR, no FORCE_COLOR) also emits no ANSI", () => {
    // spawnSync pipes stdout (not a TTY); chalk auto-detection should disable
    // color. This is the everyday `ralphy --pretty | tee` case.
    const r = ralphy(["--pretty", "config", "list"], { cwd: tmp, env: { HOME: tmp } });
    expect(ANSI.test(r.stdout), "leaked ANSI when piped without NO_COLOR").toBe(false);
  });

  test("--no-color flag also strips ANSI under --pretty", () => {
    const r = ralphy(["--pretty", "--no-color", "config", "list"], { cwd: tmp, env: { HOME: tmp } });
    expect(ANSI.test(r.stdout), "leaked ANSI under --no-color --pretty").toBe(false);
  });
});

// ─── §E — --pretty forces pretty regardless of TTY auto-detect ────────────

describe("--pretty forces pretty regardless of isTTY (#001 §E)", () => {
  // Without a TTY (spawnSync pipes stdout) the auto-detect branch picks JSON.
  // `--pretty` must override it. We compare the two renders of the same verb.

  test("config list: --pretty renders kv-tree, no flag renders JSON", () => {
    const pretty = ralphy(["--pretty", "config", "list"], { cwd: tmp, env: { HOME: tmp } });
    const auto = ralphy(["config", "list"], { cwd: tmp, env: { HOME: tmp } });

    // Auto (non-TTY) is JSON-parseable.
    expect(() => JSON.parse(auto.stdout.trim()), "auto-detect (non-TTY) output is not JSON").not.toThrow();

    // --pretty is NOT raw JSON — it's the human kv layout. A kv-tree starts
    // with indented "key  value" lines, not a `{`.
    const prettyTrim = pretty.stdout.trim();
    const looksJson = prettyTrim.startsWith("{") || prettyTrim.startsWith("[");
    expect(looksJson, "--pretty still emitted raw JSON instead of the kv tree").toBe(false);
  });

  test("models list: --pretty renders a table (box-drawing), no flag renders JSON", () => {
    const pretty = ralphy(["--pretty", "models", "list"], { cwd: tmp });
    const auto = ralphy(["models", "list"], { cwd: tmp });

    expect(() => JSON.parse(auto.stdout.trim()), "auto-detect (non-TTY) models list is not JSON").not.toThrow();
    // Pretty mode renders a cli-table3 box; assert a box-drawing char is present
    // (┌ / │ / └), which JSON output never contains.
    expect(/[┌│└┬┼─]/.test(pretty.stdout), "--pretty models list did not render a table").toBe(true);
  });

  test("--json overrides --pretty (explicit machine mode wins)", () => {
    const r = ralphy(["--pretty", "--json", "config", "list"], { cwd: tmp, env: { HOME: tmp } });
    expect(() => JSON.parse(r.stdout.trim()), "--json did not produce JSON when combined with --pretty").not.toThrow();
  });
});
