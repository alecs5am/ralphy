// Integration test for #062 — template.yaml-only discovery.
//
// `walkTemplateRoot` (cli/commands/template.ts) used to require `template.json`
// for a dir to count as a template, so a `template.yaml`-only template
// lint-passed yet was invisible to `template list / show / suggest / use`.
// #058 had to ship BOTH manifests as a workaround. This asserts the CLI now
// discovers a yaml-only workspace template — template.yaml is the single
// source of truth.
//
// Subprocess style (same shape as cli-template-extract.test.ts): `--cwd <tmp>`
// reroutes the workspace dir into the tmpdir so writes/reads land under
// <tmp>/.ralphy/workspaces/default/templates/<slug>/.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

// A valid #052 template.yaml — NO template.json alongside it.
const YAML_ONLY_MANIFEST = `version: 1
id: yaml-only-demo
kind: vibe-style
category: entertainment-viral
format: video
name: Yaml Only Demo
description: A workspace template that ships only template.yaml (no template.json).
tags:
  - yaml-only
  - discovery
`;

function templatesDir(): string {
  return path.join(tmp, ".ralphy", "workspaces", "default", "templates");
}

function setupYamlOnlyTemplate(): void {
  const dir = path.join(templatesDir(), "yaml-only-demo");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "template.yaml"), YAML_ONLY_MANIFEST);
  // A TEMPLATE.md so `template show` has a doc to print (not strictly required
  // for discovery, but mirrors a real template dir).
  fs.writeFileSync(path.join(dir, "TEMPLATE.md"), "# Yaml Only Demo\n\nVibe reference.\n");
}

// A legacy template.json-only dir — must STILL be discovered (back-compat).
function setupJsonOnlyTemplate(): void {
  const dir = path.join(templatesDir(), "json-only-legacy");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "template.json"),
    JSON.stringify({ name: "Json Only Legacy", description: "Legacy json template.", tags: ["legacy"] }, null, 2),
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-tmpl-discovery-"));
  fs.mkdirSync(path.join(tmp, ".ralphy"), { recursive: true });
  setupYamlOnlyTemplate();
  setupJsonOnlyTemplate();
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", CLI, "--cwd", tmp, ...args], {
    cwd: tmp,
    encoding: "utf8",
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

// The list payload may degrade-warn about the unreachable public library; the
// workspace rows are what we assert on. Parse the JSON, tolerating either the
// bare array shape or the { templates, warnings } wrapper.
function listIds(stdout: string): string[] {
  const parsed = JSON.parse(stdout);
  const rows = Array.isArray(parsed) ? parsed : (parsed.templates ?? []);
  return rows.map((r: { id: string }) => r.id);
}

describe("template discovery — template.yaml-only (#062)", () => {
  test("template list discovers a template.yaml-only dir", () => {
    const r = ralphy(["template", "list"]);
    if (r.exitCode !== 0) {
      console.error("STDOUT", r.stdout);
      console.error("STDERR", r.stderr);
    }
    expect(r.exitCode).toBe(0);
    const ids = listIds(r.stdout);
    expect(ids).toContain("yaml-only-demo");
  });

  test("template list still discovers a legacy template.json-only dir (back-compat)", () => {
    const r = ralphy(["template", "list"]);
    expect(r.exitCode).toBe(0);
    const ids = listIds(r.stdout);
    expect(ids).toContain("json-only-legacy");
  });

  test("yaml-only template carries name/format/tags derived from the yaml", () => {
    const r = ralphy(["template", "list"]);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const rows = Array.isArray(parsed) ? parsed : (parsed.templates ?? []);
    const row = rows.find((x: { id: string }) => x.id === "yaml-only-demo");
    expect(row).toBeTruthy();
    expect(row.name).toBe("Yaml Only Demo");
    expect(row.format).toBe("video");
    expect(row.tags).toContain("yaml-only");
  });

  test("template show --meta on a yaml-only template returns the derived meta + facets", () => {
    const r = ralphy(["template", "show", "yaml-only-demo", "--meta"]);
    if (r.exitCode !== 0) {
      console.error("STDOUT", r.stdout);
      console.error("STDERR", r.stderr);
    }
    expect(r.exitCode).toBe(0);
    const meta = JSON.parse(r.stdout);
    expect(meta.name).toBe("Yaml Only Demo");
    expect(meta.description).toContain("only template.yaml");
    expect(meta.format).toBe("video");
  });
});
