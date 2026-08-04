import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
let tmpRoot: string;
let workspaceId: string;

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
  const created = ralphy(["workspace", "create", "acme", "--name", "Acme"]);
  expect(created.exitCode).toBe(0);
  expect(created.json).toMatchObject({ slug: "acme", name: "Acme" });
  workspaceId = created.json.id;
});

afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe("workspace-owned social units", () => {
  test("creates, lists, and shows one post for several social rails", () => {
    const document = ralphy([
      "document", "create", "--workspace", workspaceId,
      "--kind", "note", "--slug", "launch-body", "--title", "Launch body",
    ]).json;
    const body = ralphy([
      "--workspace", workspaceId, "document", "revise", document.id,
      "--expected", "none", "--format", "text", "--body",
      "Ralphy now keeps account assets in one workspace.",
    ]).json;
    const created = ralphy([
      "unit",
      "create",
      "--workspace",
      workspaceId,
      "--slug",
      "launch-note",
      "--format",
      "post",
      "--items",
      JSON.stringify([{ documentRevisionId: body.id, role: "body", position: 0 }]),
      "--presentations",
      JSON.stringify([
        { platform: "telegram", caption: "Telegram launch" },
        { platform: "x", caption: "X launch" },
      ]),
    ]);
    expect(created.exitCode).toBe(0);
    expect(created.json.presentations.map((item: { platform: string }) => item.platform)).toEqual([
      "telegram",
      "x",
    ]);

    const listed = ralphy(["unit", "list", "--workspace", workspaceId]);
    expect(listed.json.items[0]).toMatchObject({ slug: "launch-note", format: "post" });
    const shown = ralphy(["unit", "show", "--workspace", workspaceId, created.json.unit.id]);
    expect(shown.json.items[0].documentRevisionId).toBe(body.id);
    expect(findNamed(tmpRoot, "unit.json")).toEqual([]);
  });

  test("creates a Medium/dev.to/X Article body without a project", () => {
    const document = ralphy([
      "document", "create", "--workspace", workspaceId,
      "--kind", "note", "--slug", "workspace-guide-body", "--title", "Workspace guide",
    ]).json;
    const body = ralphy([
      "--workspace", workspaceId, "document", "revise", document.id,
      "--expected", "none", "--format", "markdown", "--body",
      "# Workspace guide\n\nShared assets belong to the account.",
    ]).json;
    const created = ralphy([
      "unit",
      "create",
      "--workspace",
      workspaceId,
      "--slug",
      "workspace-guide",
      "--format",
      "article",
      "--items",
      JSON.stringify([{ documentRevisionId: body.id, role: "body", position: 0 }]),
      "--presentations",
      JSON.stringify([
        { platform: "devto", caption: "Dev.to guide" },
        { platform: "medium", caption: "Medium guide" },
        { platform: "x-article", caption: "X Article guide" },
      ]),
    ]);
    expect(created.exitCode).toBe(0);
    expect(created.json.items[0].documentRevisionId).toBe(body.id);
    expect(created.json.presentations.map((item: { platform: string }) => item.platform)).toEqual([
      "devto",
      "medium",
      "x-article",
    ]);
  });
});

function findNamed(root: string, name: string): string[] {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === name)
    .map((entry) => path.join(entry.parentPath, entry.name));
}
