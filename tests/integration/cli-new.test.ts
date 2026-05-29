// Integration test for `ralphy new "<brief>"` (01.09.01).
//
// As of issue #031, `ralphy new` writes to <workspace>/projects/<id>/ (the
// same canonical location as `ralphy project create`) so generate / render
// can find the project. Pre-#031 this verb wrote to ~/.ralphy/projects/<id>/
// and produced orphans invisible to the rest of the CLI — that behavior is
// gone.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-new-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function ralphyNew(args: string[]): { exitCode: number; stdout: string; stderr: string; json: unknown } {
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

describe("ralphy new (unified with project create, #031)", () => {
  test("with a brief — creates workspace/projects/<id>/ with BRIEF.md", () => {
    const r = ralphyNew(["new", "Spring 2026 ad for Acme dental floss", "--id", "spring-test-001"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project_id: string; path: string; brief?: string; name: string };
    expect(j.project_id).toBe("spring-test-001");
    // Lives under the workspace, not under ~/.ralphy/ — that's the whole #031 fix.
    expect(j.path).toContain(path.join("workspace", "projects", "spring-test-001"));
    expect(j.path).not.toContain(path.join(".ralphy", "projects"));
    expect(fs.existsSync(j.path)).toBe(true);
    expect(fs.existsSync(path.join(j.path, "BRIEF.md"))).toBe(true);
    expect(fs.readFileSync(path.join(j.path, "BRIEF.md"), "utf8")).toContain("Acme dental floss");
    // --name defaults to title-cased id.
    expect(j.name).toBe("Spring Test 001");
  });

  test("with --id only (no brief) — still creates the project dir AND registers it", () => {
    const r = ralphyNew(["new", "--id", "no-brief-test"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project_id: string; path: string; name: string };
    expect(j.project_id).toBe("no-brief-test");
    expect(j.path).toContain(path.join("workspace", "projects", "no-brief-test"));
    expect(fs.existsSync(j.path)).toBe(true);
    expect(j.name).toBe("No Brief Test");

    // Registry pointer landed under workspace/.ralph/registry.json — that's
    // what `ralphy generate` / `ralphy render` walk to find the project.
    const registryPath = path.join(tmpRoot, "workspace", ".ralph", "registry.json");
    expect(fs.existsSync(registryPath)).toBe(true);
    const reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    expect(reg.projects["no-brief-test"]).toBeTruthy();
    expect(reg.projects["no-brief-test"].name).toBe("No Brief Test");
  });

  test("auto-generates an id when neither brief nor --id is passed", () => {
    const r = ralphyNew(["new"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { project_id: string };
    expect(typeof j.project_id).toBe("string");
    expect(j.project_id.length).toBeGreaterThan(0);
  });

  test("refuses to overwrite an existing project (E_ALREADY_EXISTS)", () => {
    ralphyNew(["new", "--id", "dup-test"]);
    const r = ralphyNew(["new", "--id", "dup-test"]);
    expect(r.exitCode).not.toBe(0);
    const lastJsonLine = r.stderr
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    expect(lastJsonLine).toBeTruthy();
    const payload = JSON.parse(lastJsonLine!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_ALREADY_EXISTS");
  });

  test("project created via `new` is visible to subsequent project lookups (the #031 unification)", () => {
    // Create via `new` …
    const r1 = ralphyNew(["new", "--id", "unified-001"]);
    expect(r1.exitCode).toBe(0);

    // … and `project show <id>` (which goes through the registry that the
    // generate / render path walks) finds it.
    const r2 = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmpRoot, "--json", "project", "show", "unified-001"],
      {
        cwd: tmpRoot,
        encoding: "utf8",
        env: { ...process.env, RALPHY_SKIP_LEGACY_HINT: "1", NO_COLOR: "1" },
      },
    );
    expect(r2.status).toBe(0);
    const j = JSON.parse(r2.stdout);
    expect(j.id).toBe("unified-001");
    expect(j.name).toBe("Unified 001");
  });
});

describe("ralphy project create — --name now optional (#031)", () => {
  function ralphy(args: string[]) {
    const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
      cwd: tmpRoot,
      encoding: "utf8",
      env: { ...process.env, RALPHY_SKIP_LEGACY_HINT: "1", NO_COLOR: "1" },
    });
    let json: unknown = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      /* not JSON */
    }
    return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
  }

  test("--id without --name title-cases the id into the name", () => {
    const r = ralphy(["project", "create", "--id", "kbo-broadcast-001"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { id: string; name: string };
    expect(j.id).toBe("kbo-broadcast-001");
    expect(j.name).toBe("Kbo Broadcast 001");
  });

  test("neither --name nor --id → validation failure", () => {
    const r = ralphy(["project", "create"]);
    expect(r.exitCode).not.toBe(0);
    const lastJsonLine = r.stderr
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    expect(lastJsonLine).toBeTruthy();
    const payload = JSON.parse(lastJsonLine!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_VALIDATION_FAILED");
  });

  test("--name still works on its own (back-compat)", () => {
    const r = ralphy(["project", "create", "--name", "Old Style Project"]);
    expect(r.exitCode).toBe(0);
    const j = r.json as { id: string; name: string };
    expect(j.name).toBe("Old Style Project");
    expect(j.id).toBe("old-style-project");
  });
});

describe("`ralphy project log-*` accept --project alias (#031)", () => {
  function ralphy(args: string[]) {
    const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, ...args], {
      cwd: tmpRoot,
      encoding: "utf8",
      env: { ...process.env, RALPHY_SKIP_LEGACY_HINT: "1", NO_COLOR: "1" },
    });
    let json: unknown = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      /* not JSON */
    }
    return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
  }

  test("log-prompt --project <id>", () => {
    const cr = ralphy(["project", "create", "--id", "p-alias-001"]);
    expect(cr.exitCode).toBe(0);
    const r = ralphy(["project", "log-prompt", "--project", "p-alias-001", "--text", "hello"]);
    expect(r.exitCode).toBe(0);
    const logFile = path.join(
      tmpRoot,
      "workspace",
      "projects",
      "p-alias-001",
      "logs",
      "user-prompts.jsonl",
    );
    const lines = fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).text).toBe("hello");
  });

  test("log-asset --project <id>", () => {
    const cr = ralphy(["project", "create", "--id", "p-alias-002"]);
    expect(cr.exitCode).toBe(0);
    const r = ralphy([
      "project",
      "log-asset",
      "--project",
      "p-alias-002",
      "--kind",
      "ref-url",
      "--source",
      "https://example.com/ref.png",
    ]);
    expect(r.exitCode).toBe(0);
    const logFile = path.join(
      tmpRoot,
      "workspace",
      "projects",
      "p-alias-002",
      "logs",
      "user-assets.jsonl",
    );
    const lines = fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).source).toBe("https://example.com/ref.png");
  });

  test("log-prompt with neither positional nor --project → validation failure", () => {
    const r = ralphy(["project", "log-prompt", "--text", "orphan"]);
    expect(r.exitCode).not.toBe(0);
    const lastJsonLine = r.stderr
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    expect(lastJsonLine).toBeTruthy();
    const payload = JSON.parse(lastJsonLine!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_VALIDATION_FAILED");
  });
});
