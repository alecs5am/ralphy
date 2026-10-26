import { afterEach, beforeEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "../../cli/index.ts");
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-standalone-"));
  fs.mkdirSync(path.join(directory, "home"));
});

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function run(args: string[], cwd = directory) {
  const result = spawnSync(process.execPath, ["--no-env-file", CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: path.join(directory, "home"),
      RALPHY_PROJECT_DIR: "",
      OPENROUTER_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      FAL_KEY: "",
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("standalone setup creates a workspace that a separate CLI process can use", () => {
  const setup = run(["setup", "--non-interactive"]);
  expect(setup.status).toBe(0);
  const summary = JSON.parse(setup.stdout);
  expect(summary.project_dir).toBeNull();
  expect(summary.workspace_id).toMatch(/^ws_/);
  expect(summary.data_root).toBe(fs.realpathSync(path.join(directory, ".ralphy")));

  const created = run(["--root", summary.data_root, "--workspace", summary.workspace_id,
    "new", "A coffee shop poster"]);
  expect(created.status).toBe(0);
  expect(JSON.parse(created.stdout).workspaceId).toBe(summary.workspace_id);

  const repeated = run(["setup", "--non-interactive"]);
  expect(repeated.status).toBe(0);
  expect(JSON.parse(repeated.stdout).workspace_id).toBe(summary.workspace_id);
  expect(fs.existsSync(path.join(directory, ".env"))).toBe(false);
  expect(fs.existsSync(path.join(directory, "package.json"))).toBe(false);
});

test("standalone setup refuses an existing legacy data root without changing it", () => {
  const dataRoot = path.join(directory, ".ralphy");
  fs.mkdirSync(dataRoot);
  const legacy = '{"active_workspace":"keep-me"}\n';
  fs.writeFileSync(path.join(dataRoot, "config.json"), legacy);
  const result = run(["setup", "-y"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("E_MIGRATION_INCOMPLETE");
  expect(fs.readFileSync(path.join(dataRoot, "config.json"), "utf8")).toBe(legacy);
  expect(fs.existsSync(path.join(dataRoot, "ralphy.db"))).toBe(false);
});

test("setup status stays read-only on a fresh machine", () => {
  const result = run(["setup", "--status"]);
  expect(result.status).toBe(0);
  expect(fs.existsSync(path.join(directory, ".ralphy"))).toBe(false);
});

test("setup can initialize an explicit data root without writing to cwd", () => {
  const dataRoot = path.join(directory, "library");
  const result = run(["--root", dataRoot, "setup", "-y"]);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).data_root).toBe(fs.realpathSync(dataRoot));
  expect(fs.existsSync(path.join(dataRoot, "ralphy.db"))).toBe(true);
  expect(fs.existsSync(path.join(directory, ".ralphy"))).toBe(false);
});

test("setup preserves a legacy workspace tree", () => {
  fs.mkdirSync(path.join(directory, "workspace", "projects"), { recursive: true });
  const result = run(["setup", "-y"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("E_LEGACY_LAYOUT");
  expect(fs.existsSync(path.join(directory, ".ralphy"))).toBe(false);
});

test("setup does not choose an ambient Workspace when several exist", () => {
  const first = JSON.parse(run(["setup", "-y"]).stdout);
  expect(run(["--root", first.data_root, "workspace", "create", "second"]).status).toBe(0);
  const result = run(["setup", "-y"]);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).workspace_id).toBeNull();
  const workspaces = run(["--root", first.data_root, "workspace", "list"]);
  expect(JSON.parse(workspaces.stdout).items).toHaveLength(2);
});

test("setup in a library descendant reuses its existing data root", () => {
  const first = JSON.parse(run(["setup", "-y"]).stdout);
  const descendant = path.join(directory, "work", "drafts");
  fs.mkdirSync(descendant, { recursive: true });
  const result = run(["setup", "-y"], descendant);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).data_root).toBe(first.data_root);
  expect(JSON.parse(result.stdout).workspace_id).toBe(first.workspace_id);
  expect(fs.existsSync(path.join(descendant, ".ralphy"))).toBe(false);
});

test("setup refuses legacy data beneath a modern ancestor library", () => {
  expect(run(["setup", "-y"]).status).toBe(0);
  const legacy = path.join(directory, "old");
  fs.mkdirSync(path.join(legacy, "workspace", "projects"), { recursive: true });
  const result = run(["setup", "-y"], legacy);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("E_LEGACY_LAYOUT");
  expect(fs.existsSync(path.join(legacy, ".ralphy"))).toBe(false);
});
