// Integration test for `ralphy template extract` (issue #033).
//
// Builds a synthetic finished project under a tmpdir-bound ralphy root,
// invokes the verb, and asserts the resulting templates/<cat>/<slug>/
// has the expected files. Subprocess-style — same shape as cli-clone.test.ts.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;

function setupProject(): void {
  const projectId = "extract-demo-001";
  const projDir = path.join(tmp, ".ralphy", "workspaces", "default", "projects", projectId);
  fs.mkdirSync(path.join(projDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "artifacts", "refs"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "postmortem"), { recursive: true });

  fs.writeFileSync(
    path.join(projDir, "scenario.json"),
    JSON.stringify({
      id: projectId,
      name: "Demo Onboarding",
      brand: "acme",
      persona: "max",
      scenes: [
        { id: "scene-01", type: "hook", durationSec: 3, label: "Hook", voiceover: { text: "Hello there." } },
        { id: "scene-02", type: "content", durationSec: 10, label: "Body" },
      ],
    }),
  );

  fs.writeFileSync(path.join(projDir, "prompts", "scene-01.txt"), "A first prompt.");
  fs.writeFileSync(path.join(projDir, "prompts", "scene-02.txt"), "A second prompt.");

  // Light ref — should be copied, not lifted.
  fs.writeFileSync(path.join(projDir, "artifacts", "refs", "hero.png"), Buffer.alloc(2048, 1));

  // index.html with data-composition-variables.
  fs.writeFileSync(
    path.join(projDir, "index.html"),
    `<!doctype html>
<html data-composition-variables='[{"id":"wordmark","type":"string","default":"ACME"}]'>
<head><title>x</title></head><body></body></html>`,
  );

  // POSTMORTEM in postmortem/02-lessons.md.
  fs.writeFileSync(
    path.join(projDir, "postmortem", "02-lessons.md"),
    `# 02 — Lessons learned

## Lessons learned

- Match the source motion primitive first.
- Always pin a comparison harness.

## Other section

irrelevant
`,
  );
}

// #062: a scenario-less project — an asset-based still-set / HyperFrames ad
// (e.g. free-air-vpn-stickerpack, odindoma-fb-ad-001). No scenario.json. Has an
// asset-manifest.json + index.html + refs/ instead. extract must tolerate it.
function setupScenarioLessProject(): void {
  const projectId = "stillset-demo-001";
  const projDir = path.join(tmp, ".ralphy", "workspaces", "default", "projects", projectId);
  fs.mkdirSync(path.join(projDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "artifacts", "refs"), { recursive: true });
  fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });

  // Deliberately NO scenario.json.

  // asset-manifest.json with a slots map (the shape real projects ship).
  fs.writeFileSync(
    path.join(projDir, "asset-manifest.json"),
    JSON.stringify({
      slots: {
        "sticker-01": { kind: "image", path: "artifacts/images/sticker-01.png" },
        "sticker-02": { kind: "image", path: "artifacts/images/sticker-02.png" },
      },
    }),
  );

  fs.writeFileSync(path.join(projDir, "prompts", "sticker-01.txt"), "A sticker prompt.");

  fs.writeFileSync(path.join(projDir, "artifacts", "refs", "mascot.png"), Buffer.alloc(2048, 1));

  // HyperFrames index.html with data-composition-variables.
  fs.writeFileSync(
    path.join(projDir, "index.html"),
    `<!doctype html>
<html data-composition-variables='[{"id":"headline","type":"string","default":"FREE AIR"}]'>
<head><title>x</title></head><body></body></html>`,
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-tmpl-extract-"));
  fs.mkdirSync(path.join(tmp, ".ralphy"), { recursive: true });
  // `template extract` now writes to the user-local workspace tier
  // (`workspace/templates/<slug>/`, flat) — the repo-public templates/ folder
  // is retired. `--cwd <tmp>` reroutes the workspace dir to the tmp, so writes
  // land in <tmp>/workspace/templates/<slug>/.
  setupProject();
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

describe("ralphy template extract", () => {
  test("writes workspace/templates/<slug>/ with manifest + prompts + scenario + README", () => {
    const r = ralphy([
      "template",
      "extract",
      "extract-demo-001",
      "--category",
      "b2b-saas",
      "--slug",
      "extracted-demo",
      "--kind",
      "vibe-style",
      "--name",
      "Extracted Demo",
      "--description",
      "Integration-test extracted template.",
      "--tags",
      "demo,test",
    ]);
    if (r.exitCode !== 0) {
      console.error("STDOUT", r.stdout);
      console.error("STDERR", r.stderr);
    }
    expect(r.exitCode).toBe(0);

    const target = path.join(tmp, ".ralphy", "workspaces", "default", "templates", "extracted-demo");
    expect(fs.existsSync(path.join(target, "template.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "TEMPLATE.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "sample-remix.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "scenario-template.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "composition-variables.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "prompts", "scene-01.txt"))).toBe(true);
    expect(fs.existsSync(path.join(target, "prompts", "scene-02.txt"))).toBe(true);
    expect(fs.existsSync(path.join(target, "refs", "hero.png"))).toBe(true);

    // Manifest sanity
    const manifest = JSON.parse(fs.readFileSync(path.join(target, "template.json"), "utf-8"));
    expect(manifest.version).toBe(1);
    expect(manifest.id).toBe("extracted-demo");
    expect(manifest.category).toBe("b2b-saas");
    expect(manifest.kind).toBe("vibe-style");
    expect(manifest.tags).toEqual(["demo", "test"]);
    expect(Array.isArray(manifest.scenes)).toBe(true);
    expect(manifest.scenes.length).toBe(2);
    expect(manifest.scenes[0].role).toBe("hook");

    // Scenario template has {{slot}} substitutions.
    const scenarioTmpl = JSON.parse(fs.readFileSync(path.join(target, "scenario-template.json"), "utf-8"));
    expect(scenarioTmpl.slots.brand).toBe("acme");
    expect(scenarioTmpl.scenario.brand).toBe("{{brand}}");

    // README pulled "Lessons learned" content.
    const readme = fs.readFileSync(path.join(target, "README.md"), "utf-8");
    expect(readme).toContain("# extracted-demo");
    expect(readme).toContain("Match the source motion primitive");
    expect(readme).not.toContain("Other section");

    // Gen-log was appended.
    const genlog = fs.readFileSync(path.join(tmp, ".ralphy", "workspaces", "default", "projects", "extract-demo-001", "logs", "generations.jsonl"), "utf-8");
    expect(genlog).toContain("template.extract");
    expect(genlog).toContain("extracted-demo");

    // SOURCE PROJECT IS UNMODIFIED (AGENTS.md invariant #14) — refs/ still there.
    expect(fs.existsSync(path.join(tmp, ".ralphy", "workspaces", "default", "projects", "extract-demo-001", "artifacts", "refs", "hero.png"))).toBe(true);
  });

  test("refuses on unknown project id with E_NOT_FOUND", () => {
    const r = ralphy([
      "template",
      "extract",
      "does-not-exist-999",
      "--category",
      "b2b-saas",
      "--slug",
      "should-not-write",
    ]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_NOT_FOUND");
  });

  test("refuses on banned slug", () => {
    const r = ralphy([
      "template",
      "extract",
      "extract-demo-001",
      "--category",
      "b2b-saas",
      "--slug",
      "hormozi-style",
    ]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_INPUT_INVALID");
  });

  test("refuses on invalid category", () => {
    const r = ralphy([
      "template",
      "extract",
      "extract-demo-001",
      "--category",
      "not-a-category",
      "--slug",
      "x",
    ]);
    expect(r.exitCode).not.toBe(0);
  });

  // ─── #062: scenario-less projects (still-sets / HyperFrames ads) ────────────
  test("tolerates a project with NO scenario.json (still-set / HyperFrames ad)", () => {
    setupScenarioLessProject();
    const r = ralphy([
      "template",
      "extract",
      "stillset-demo-001",
      "--category",
      "dtc-commerce",
      "--slug",
      "stillset-template",
      "--format",
      "sticker-pack",
      "--name",
      "Sticker Pack Template",
      "--description",
      "Scenario-less still-set extracted template.",
    ]);
    if (r.exitCode !== 0) {
      console.error("STDOUT", r.stdout);
      console.error("STDERR", r.stderr);
    }
    expect(r.exitCode).toBe(0);

    const target = path.join(tmp, ".ralphy", "workspaces", "default", "templates", "stillset-template");
    // Produced a valid template dir.
    expect(fs.existsSync(path.join(target, "template.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "TEMPLATE.md"))).toBe(true);
    expect(fs.existsSync(path.join(target, "README.md"))).toBe(true);
    // Derived from index.html + refs.
    expect(fs.existsSync(path.join(target, "composition-variables.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "refs", "mascot.png"))).toBe(true);
    expect(fs.existsSync(path.join(target, "prompts", "sticker-01.txt"))).toBe(true);
    // Scenario-derived sidecar is SKIPPED — no scenario.json upstream.
    expect(fs.existsSync(path.join(target, "scenario-template.json"))).toBe(false);

    // Manifest is valid v1 with an empty scene table.
    const manifest = JSON.parse(fs.readFileSync(path.join(target, "template.json"), "utf-8"));
    expect(manifest.version).toBe(1);
    expect(manifest.id).toBe("stillset-template");
    expect(manifest.format).toBe("sticker-pack");
    expect(Array.isArray(manifest.scenes)).toBe(true);
    expect(manifest.scenes.length).toBe(0);

    // Output payload reports scenario-less mode + the derived asset slots.
    // `out()` pretty-prints the object (multi-line) after an `ok()` line, so
    // slice from the first `{` to end and parse that block.
    const firstBrace = r.stdout.indexOf("{");
    expect(firstBrace).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(r.stdout.slice(firstBrace));
    expect(payload.has_scenario).toBe(false);
    expect(payload.asset_slots).toEqual(["sticker-01", "sticker-02"]);

    // SOURCE PROJECT UNMODIFIED — no scenario.json was conjured.
    expect(fs.existsSync(path.join(tmp, ".ralphy", "workspaces", "default", "projects", "stillset-demo-001", "scenario.json"))).toBe(false);
  });

  test("still refuses a present-but-malformed scenario.json", () => {
    setupScenarioLessProject();
    const projDir = path.join(tmp, ".ralphy", "workspaces", "default", "projects", "stillset-demo-001");
    fs.writeFileSync(path.join(projDir, "scenario.json"), "{ not valid json,,,");
    const r = ralphy([
      "template",
      "extract",
      "stillset-demo-001",
      "--category",
      "dtc-commerce",
      "--slug",
      "malformed-scenario-template",
    ]);
    expect(r.exitCode).not.toBe(0);
    const last = r.stderr.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    expect(last).toBeTruthy();
    const payload = JSON.parse(last!) as { error: { code: string } };
    expect(payload.error.code).toBe("E_FILE_MALFORMED");
  });
});
