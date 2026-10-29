// Store-root render and Project creation gaps (#591).
//
// Found while fixing #589: on a data root with `ralphy.db`,
//   1. `ralphy render <slug>` failed with `E_INTERNAL Project not found: <slug>`
//      because the store query got the positional slug instead of the resolved
//      Project id;
//   2. a Project created by `ralphy new` or `ralphy project create` had no video
//      Composition, so even `render <id>` could not build it;
//   3. `ralphy new` on a root holding Project trees but no store created an
//      empty store, which hid every existing tree.
//
// HOME is isolated so no global link or profile leaks in. The HyperFrames
// engine is a `bunx` stub on PATH (the cheapest real render path the
// Composition build tests use): it records the materialized source tree it was
// launched in, then publishes an output by rename like the real renderer.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: string;
let bin: string;
let seen: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-store-render-591-")));
  bin = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-store-render-591-bin-"));
  seen = path.join(bin, "seen.txt");
  const bunx = path.join(bin, "bunx");
  fs.writeFileSync(bunx, `#!/bin/sh
[ -f index.html ] || exit 5
{ find . -type f | sort; printf '%s\\n' '--- index.html'; cat index.html; } > '${seen}'
while [ $# -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    shift
    scratch=$(mktemp -d "$(dirname "$1")/render-work-XXXXXX") || exit 3
    printf video > "$scratch/finished.mp4"
    mv "$scratch/finished.mp4" "$1" || exit 4
    rmdir "$scratch"
    exit 0
  fi
  shift
done
exit 2
`);
  fs.chmodSync(bunx, 0o755);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
});

/** The engine checks these before launching the renderer. */
function renderToolsAvailable(): boolean {
  return ["node", "ffmpeg", "ffprobe"].every((command) => Bun.which(command) !== null);
}

function ralphy(args: string[]): { exitCode: number; stdout: string; stderr: string; json: any } {
  const r = spawnSync("bun", ["run", CLI, "--json", ...args], {
    cwd: tmp,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: tmp,
      RALPHY_PROJECT_DIR: "",
      RALPHY_SKIP_LEGACY_HINT: "1",
      NO_COLOR: "1",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
    timeout: 60_000,
  });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* error case */
  }
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, json };
}

function errorCode(stderr: string): string | null {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string } };
      if (parsed.error?.code) return parsed.error.code;
    } catch {
      /* diagnostic line */
    }
  }
  return null;
}

function projectTree(name: string): string {
  return path.join(tmp, ".ralphy", "workspaces", "default", "projects", name);
}

function storePath(): string {
  return path.join(tmp, ".ralphy", "ralphy.db");
}

const INDEX_V1 = `<!doctype html>
<html>
  <head><link rel="stylesheet" href="assets/style.css"></head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="160" data-height="120">
      <img src="artifacts/images/hero.png" alt="">
      <h1>version one</h1>
    </div>
  </body>
</html>
`;

/** A minimal HyperFrames tree, as an agent writes it after `ralphy new`. */
function writeHyperframesTree(dir: string, index = INDEX_V1): void {
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(dir, "artifacts", "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "render"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), index);
  fs.writeFileSync(path.join(dir, "assets", "style.css"), "h1 { color: red; }\n");
  fs.writeFileSync(path.join(dir, "artifacts", "images", "hero.png"), "png-bytes");
  // Render outputs are never Composition sources.
  fs.writeFileSync(path.join(dir, "render", "final.mp4"), "an older master");
}

function seenFiles(): string[] {
  const text = fs.readFileSync(seen, "utf8");
  return text.split("--- index.html")[0]!.trim().split("\n");
}

function compositionHistory(projectId: string): { id: string; revisions: Array<{ id: string; state: string; parentRevisionId: string | null; engine: string }> } {
  const listed = ralphy(["composition", "list", "--project", projectId]);
  expect(listed.exitCode, listed.stderr).toBe(0);
  const videos = (listed.json.items as Array<{ id: string; kind: string }>).filter((item) => item.kind === "video");
  expect(videos).toHaveLength(1);
  const shown = ralphy(["composition", "show", videos[0]!.id]);
  expect(shown.exitCode, shown.stderr).toBe(0);
  return shown.json;
}

describe("store root: CLI-created Projects render by slug and by id (#591)", () => {
  test.skipIf(!renderToolsAvailable())(
    "new, write index.html, render <slug>, render <id>, edit, render again",
    () => {
      const created = ralphy(["new", "--id", "alpha-001"]);
      expect(created.exitCode, created.stderr).toBe(0);
      expect(fs.existsSync(storePath())).toBe(true);
      const projectId = created.json.id as string;
      expect(projectId).toStartWith("prj_");
      expect(created.json.path).toBe(projectTree("alpha-001"));
      writeHyperframesTree(projectTree("alpha-001"));

      // The dry run names the plan and records nothing.
      const plan = ralphy(["render", "alpha-001", "--dry-run"]);
      expect(plan.exitCode, plan.stderr).toBe(0);
      expect(plan.json).toMatchObject({
        dryRun: true,
        engine: "composition",
        projectId,
        compositionId: null,
        revisionId: null,
        projectTree: { path: projectTree("alpha-001"), revision: "create" },
      });
      const listedBefore = ralphy(["composition", "list", "--project", projectId]);
      expect(listedBefore.exitCode, listedBefore.stderr).toBe(0);
      expect(listedBefore.json.items).toEqual([]);

      const bySlug = ralphy(["render", "alpha-001"]);
      expect(bySlug.exitCode, bySlug.stderr).toBe(0);
      expect(bySlug.json.state).toBe("succeeded");
      expect(bySlug.json.outputs.map((output: { role: string }) => output.role)).toEqual(["master"]);
      // The engine ran on the Project tree's HyperFrames sources, not on its outputs.
      const files = seenFiles();
      expect(files).toContain("./index.html");
      expect(files).toContain("./assets/style.css");
      expect(files).toContain("./artifacts/images/hero.png");
      expect(files.some((file) => file.startsWith("./render/"))).toBe(false);
      expect(files.some((file) => file.startsWith("./logs/"))).toBe(false);
      expect(fs.readFileSync(seen, "utf8")).toContain("version one");

      const first = compositionHistory(projectId);
      expect(first.revisions).toHaveLength(1);
      expect(first.revisions[0]).toMatchObject({
        id: bySlug.json.compositionRevisionId,
        state: "sealed",
        parentRevisionId: null,
        engine: "hyperframes",
      });

      // By id: an unchanged tree builds the same sealed revision again.
      const byId = ralphy(["render", projectId]);
      expect(byId.exitCode, byId.stderr).toBe(0);
      expect(byId.json.state).toBe("succeeded");
      expect(byId.json.compositionRevisionId).toBe(bySlug.json.compositionRevisionId);
      expect(compositionHistory(projectId).revisions).toHaveLength(1);

      // An edited tree is recorded as a new, append-only child revision.
      fs.writeFileSync(
        path.join(projectTree("alpha-001"), "index.html"),
        INDEX_V1.replace("version one", "version two"),
      );
      const revisedPlan = ralphy(["render", "alpha-001", "--dry-run"]);
      expect(revisedPlan.exitCode, revisedPlan.stderr).toBe(0);
      expect(revisedPlan.json).toMatchObject({ revisionId: null, projectTree: { revision: "revise" } });
      const edited = ralphy(["render", "alpha-001"]);
      expect(edited.exitCode, edited.stderr).toBe(0);
      expect(edited.json.compositionRevisionId).not.toBe(bySlug.json.compositionRevisionId);
      expect(fs.readFileSync(seen, "utf8")).toContain("version two");
      const second = compositionHistory(projectId);
      expect(second.revisions).toHaveLength(2);
      const child = second.revisions.find((revision) => revision.id === edited.json.compositionRevisionId)!;
      expect(child).toMatchObject({ state: "sealed", parentRevisionId: bySlug.json.compositionRevisionId });
      expect(second.revisions.find((revision) => revision.id === bySlug.json.compositionRevisionId)!.state).toBe("sealed");
    },
    120_000,
  );

  test.skipIf(!renderToolsAvailable())(
    "project create, write the tree, render <slug>; compose and save-version resolve the slug",
    () => {
      expect(ralphy(["new", "--id", "seed-001"]).exitCode).toBe(0);
      const created = ralphy(["project", "create", "--id", "beta-001"]);
      expect(created.exitCode, created.stderr).toBe(0);
      const projectId = created.json.id as string;
      writeHyperframesTree(projectTree("beta-001"));

      const rendered = ralphy(["render", "beta-001"]);
      expect(rendered.exitCode, rendered.stderr).toBe(0);
      expect(rendered.json.state).toBe("succeeded");

      // The other Composition verbs take the slug too, and report the store id.
      const compose = ralphy(["compose", "beta-001", "--dry-run"]);
      expect(compose.exitCode, compose.stderr).toBe(0);
      expect(compose.json).toMatchObject({ projectId, revisionId: rendered.json.compositionRevisionId });
      const hyperframes = ralphy(["hyperframes", "render", "beta-001"]);
      expect(hyperframes.exitCode, hyperframes.stderr).toBe(0);
      expect(hyperframes.json.compositionRevisionId).toBe(rendered.json.compositionRevisionId);
      const saved = ralphy(["hyperframes", "save-version", "beta-001"]);
      expect(saved.exitCode, saved.stderr).toBe(0);
      expect(saved.json.parentRevisionId).toBe(rendered.json.compositionRevisionId);
    },
    120_000,
  );

  test("a store Project without a Composition or index.html is refused with a clear input error", () => {
    expect(ralphy(["new", "--id", "empty-001"]).exitCode).toBe(0);
    const rendered = ralphy(["render", "empty-001", "--dry-run"]);
    expect(rendered.exitCode).not.toBe(0);
    expect(errorCode(rendered.stderr)).toBe("E_INPUT_INVALID");
    expect(rendered.stderr).toContain("index.html");
  });
});

describe("tree-only root: `ralphy new` refuses instead of hiding the trees (#591)", () => {
  test("new gives the migration error, creates nothing, and existing trees still resolve", () => {
    fs.mkdirSync(projectTree("alpha-001"), { recursive: true });

    const created = ralphy(["new", "--id", "beta-001"]);
    expect(created.exitCode).not.toBe(0);
    expect(errorCode(created.stderr)).toBe("E_MIGRATION_INCOMPLETE");
    expect(created.stderr).toContain("ralphy migrate");
    expect(fs.existsSync(storePath())).toBe(false);
    expect(fs.existsSync(projectTree("beta-001"))).toBe(false);

    const plan = ralphy(["render", "alpha-001", "--dry-run"]);
    expect(plan.exitCode, plan.stderr).toBe(0);
    expect(plan.json.dryRun).toBe(true);
    expect(fs.existsSync(storePath())).toBe(false);
  });

  test("new on an empty fresh root still creates the store and the Project", () => {
    const created = ralphy(["new", "--id", "first-001"]);
    expect(created.exitCode, created.stderr).toBe(0);
    expect(fs.existsSync(storePath())).toBe(true);
    expect(fs.existsSync(projectTree("first-001"))).toBe(true);
  });
});
