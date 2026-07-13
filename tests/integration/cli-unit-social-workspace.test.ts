import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
let tmpRoot: string;

function ralphy(args: string[]) {
  const result = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
    cwd: tmpRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  let json: any = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {}
  return { exitCode: result.status ?? -1, json, stderr: result.stderr };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-social-unit-"));
  expect(ralphy(["workspace", "create", "acme", "--name", "Acme"]).exitCode).toBe(0);
});

afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe("workspace-owned social units", () => {
  test("creates, lists, and shows one post for several social rails", () => {
    const created = ralphy([
      "unit",
      "create",
      "--workspace",
      "acme",
      "--slug",
      "launch-note",
      "--format",
      "post",
      "--text",
      "Ralphy now keeps account assets in one workspace.",
      "--destination",
      "telegram",
      "--destination",
      "x",
    ]);
    expect(created.exitCode).toBe(0);
    expect(created.json.manifest.text.destinations).toEqual(["telegram", "x"]);

    const unitDir = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "acme",
      "units",
      "launch-note",
    );
    expect(fs.existsSync(path.join(unitDir, "unit.json"))).toBe(true);

    const listed = ralphy(["unit", "list", "--workspace", "acme"]);
    expect(listed.json[0]).toMatchObject({ slug: "launch-note", format: "post" });
    const shown = ralphy(["unit", "show", "--workspace", "acme", "launch-note"]);
    expect(shown.json.text.body).toContain("account assets");
    expect(ralphy(["unit", "delete", "--workspace", "acme", "launch-note"]).exitCode).toBe(0);
    expect(fs.existsSync(unitDir)).toBe(false);
  });

  test("creates a Medium/dev.to/X Article body without a project", () => {
    const created = ralphy([
      "unit",
      "create",
      "--workspace",
      "acme",
      "--slug",
      "workspace-guide",
      "--format",
      "article",
      "--title",
      "Workspace guide",
      "--text",
      "# Workspace guide\n\nShared assets belong to the account.",
      "--destination",
      "devto",
      "--destination",
      "medium",
      "--destination",
      "x-article",
    ]);
    expect(created.exitCode).toBe(0);
    expect(created.json.manifest.article.body).toBe("body.md");
    expect(created.json.manifest.text.destinations).toEqual(["devto", "medium", "x-article"]);
  });
});
