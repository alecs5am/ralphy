// `ralphy catalog use` (#594) through the real CLI entry.
//
// HOME is isolated and every root is a fresh temp dir holding a copy of the
// repo `catalog/` tree (the catalog definitions resolve from the root), a
// project tree with a minimal valid HyperFrames index.html, and a one-entry
// SFX pack. Two roots are covered: a tree-only root (no store; the snapshot is
// compositions/v<N>.html) and a store root (`ralphy new`; the snapshot is the
// #591 project-tree Composition revision). No renders, no network, no paid
// calls. The upstream `hyperframes lint` runs from node_modules when present.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const UPSTREAM_HF = path.join(REPO, "node_modules", ".bin", "hyperframes");
const SFX_ID = "sfx-impact-1aa30c0d"; // flash-white's cue in catalog/manifest.json

let tmp: string;

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #000000; }
      .scene { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }
      #s1 { background: #1d3b8f; }
      #s2 { background: #8f2a1d; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="6">
      <div id="s1" class="scene clip" data-start="0" data-duration="3.2" data-track-index="0"></div>
      <div id="s2" class="scene clip" data-start="2.8" data-duration="3.2" data-track-index="1"></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      tl.from("#s1", { opacity: 0, duration: 0.4 }, 0.1);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

const WORDS = {
  captions: [
    { text: "Most", startMs: 100, endMs: 380, timestampMs: null, confidence: 0.98 },
    { text: "videos", startMs: 400, endMs: 760, timestampMs: null, confidence: 0.98 },
    { text: "lose", startMs: 800, endMs: 1040, timestampMs: null, confidence: 0.97 },
    { text: "you.", startMs: 1060, endMs: 1400, timestampMs: null, confidence: 0.99 },
  ],
};

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-catalog-use-594-")));
  fs.cpSync(path.join(REPO, "catalog"), path.join(tmp, "catalog"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "words.json"), JSON.stringify(WORDS));
  writeSfxPack();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeSfxPack(): void {
  const dir = path.join(tmp, ".ralphy", "catalog", "sfx");
  fs.mkdirSync(path.join(dir, "impact"), { recursive: true });
  fs.writeFileSync(path.join(dir, "impact", `${SFX_ID}.mp3`), "fake-mp3-bytes");
  const none = { meanDb: null, peakDb: null, lufs: null };
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      version: 1,
      generatedAt: "2026-10-30T00:00:00.000Z",
      stats: { scanned: 1, skippedRaw: 0, unique: 1, sha256Duplicates: 0, fingerprintDuplicates: 0, failed: 0, byTag: { impact: 1 } },
      entries: [
        {
          id: SFX_ID,
          tag: "impact",
          file: `impact/${SFX_ID}.mp3`,
          sha256: "a".repeat(64),
          fingerprint: "00",
          durationSec: 0.9,
          source: { workspace: "default", project: "old-001", file: "hit.mp3" },
          duplicates: [],
          loudness: { target: -16, truePeak: -1.5, before: none, after: none },
        },
      ],
    }),
  );
}

function projectTree(name: string): string {
  return path.join(tmp, ".ralphy", "workspaces", "default", "projects", name);
}

function writeTree(name: string, index = INDEX): string {
  const dir = projectTree(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), index);
  return dir;
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

function errorOf(stderr: string): { code?: string; message?: string } {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string; message?: string } };
      if (parsed.error?.code) return parsed.error;
    } catch {
      /* diagnostic line */
    }
  }
  return {};
}

/** Every file under a directory, relative, with its bytes, for "wrote nothing" checks. */
function treeState(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

function usageRecords(dir: string): any[] {
  const file = path.join(dir, "logs", "catalog-uses.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

const TRANSITION = ["catalog", "use", "flash-white", "--project", "demo-001", "--at", "2.8", "--from", "#s1", "--to", "#s2"];

describe("catalog use on a tree-only root (#594)", () => {
  test("--dry-run prints the plan (files, clip markup, usage record) and writes nothing", () => {
    const dir = writeTree("demo-001");
    const before = treeState(dir);
    const r = ralphy([...TRANSITION, "--dry-run"]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.json).toMatchObject({
      dryRun: true,
      item: "flash-white",
      kind: "transition",
      useId: "catalog-flash-white-1",
      clip: { start: 2.8, duration: 0.4, end: 3.2, track: 2, swapAt: 3 },
      copy: { path: "compositions/catalog/flash-white.html", action: "write" },
      snapshot: { kind: "file", path: "compositions/v1.html", action: "write" },
      sfx: { id: SFX_ID, path: `artifacts/sfx/${SFX_ID}.mp3`, action: "write", start: 2.95, volume: 0.85 },
    });
    expect(r.json.clip.markup).toContain('data-composition-src="compositions/catalog/flash-white.html"');
    expect(r.json.files.map((f: { path: string }) => f.path)).toEqual([
      "compositions/v1.html",
      "compositions/catalog/flash-white.html",
      `artifacts/sfx/${SFX_ID}.mp3`,
      "index.html",
      "logs/catalog-uses.jsonl",
    ]);
    expect(r.json.record).toMatchObject({ path: "logs/catalog-uses.jsonl", entry: { item: "flash-white", start: 2.8, duration: 0.4 } });
    expect(treeState(dir)).toEqual(before);
  });

  test("a transition and a caption: snapshots, clips at the right time, fragment copies, SFX, usage records, lint", () => {
    const dir = writeTree("demo-001");

    const t = ralphy([...TRANSITION, "--param", "color=#ffeedd"]);
    expect(t.exitCode, t.stderr).toBe(0);
    // Snapshot first: v1 is the untouched original.
    expect(fs.readFileSync(path.join(dir, "compositions", "v1.html"), "utf8")).toBe(INDEX);
    const copy = fs.readFileSync(path.join(dir, "compositions", "catalog", "flash-white.html"), "utf8");
    expect(copy).toContain("function catalog_flash_white(tl, o)");
    expect(copy).toContain("data-composition-variables=");
    expect(fs.readFileSync(path.join(dir, "artifacts", "sfx", `${SFX_ID}.mp3`), "utf8")).toBe("fake-mp3-bytes");
    let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('id="catalog-flash-white-1" data-composition-id="catalog-flash-white-1" data-composition-src="compositions/catalog/flash-white.html" data-start="2.8" data-duration="0.4" data-track-index="2"');
    expect(html).toContain('"color":"#ffeedd"');
    expect(html).toMatch(new RegExp(`<audio id="catalog-flash-white-1-sfx" data-start="2.95" data-duration="0.9" data-track-index="3" src="artifacts/sfx/${SFX_ID}.mp3" data-volume="0.85"`));
    // The clips land inside the root composition, before its closing tag and the script.
    expect(html.indexOf("catalog-flash-white-1")).toBeLessThan(html.indexOf("<script>\n      window.__timelines"));

    const c = ralphy(["catalog", "use", "cap-one-word-pop", "--project", "demo-001", "--at", "0.5", "--words", "words.json", "--param", "size=110"]);
    expect(c.exitCode, c.stderr).toBe(0);
    // Default caption duration: the last word's end (1.4 s) + 0.6 s.
    expect(c.json.clip).toMatchObject({ start: 0.5, duration: 2, end: 2.5, track: 2 });
    expect(c.json.snapshot).toEqual({ kind: "file", path: "compositions/v2.html", action: "write" });
    expect(fs.readFileSync(path.join(dir, "compositions", "v1.html"), "utf8")).toBe(INDEX);
    html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    expect(fs.readFileSync(path.join(dir, "compositions", "v2.html"), "utf8")).not.toBe(html);
    expect(html).toContain('id="catalog-cap-one-word-pop-1"');
    expect(html).toContain('data-start="0.5" data-duration="2" data-track-index="2"');
    expect(html).toContain('\\"text\\":\\"videos\\",\\"start\\":0.4,\\"end\\":0.76');
    expect(fs.existsSync(path.join(dir, "compositions", "catalog", "cap-one-word-pop.html"))).toBe(true);

    const records = usageRecords(dir);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      schema: "ralphy.catalog-use/v1",
      useId: "catalog-flash-white-1",
      item: "flash-white",
      kind: "transition",
      copy: "compositions/catalog/flash-white.html",
      start: 2.8,
      duration: 0.4,
      track: 2,
      params: { duration: 0.4, peak: 3, color: "#ffeedd" },
      context: { from: "#s1", to: "#s2" },
      sfx: { id: SFX_ID, file: `artifacts/sfx/${SFX_ID}.mp3`, start: 2.95, volume: 0.85 },
      snapshot: { kind: "file", path: "compositions/v1.html" },
    });
    expect(records[0].itemSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof records[0].timestamp).toBe("string");
    expect(records[1]).toMatchObject({ item: "cap-one-word-pop", params: { size: 110 }, context: { words: { count: 4 } } });

    // In-repo HyperFrames lint (offline).
    const lint = ralphy(["hyperframes", "lint", "demo-001"]);
    expect(lint.exitCode, lint.stderr).toBe(0);
    expect(lint.json).toMatchObject({ ok: true, errors: 0 });
    // Upstream HyperFrames lint (static, offline), when the dependency is installed.
    if (fs.existsSync(UPSTREAM_HF)) {
      const up = spawnSync(UPSTREAM_HF, ["lint", dir, "--json"], {
        encoding: "utf8",
        env: { ...process.env, HOME: tmp, HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_TELEMETRY: "1" },
        timeout: 60_000,
      });
      const report = JSON.parse(up.stdout) as { ok: boolean; errorCount: number; warningCount: number };
      expect(report).toMatchObject({ ok: true, errorCount: 0, warningCount: 0 });
    }
  }, 120_000);

  test("a second use reuses the copy; an edited copy is never overwritten (a versioned copy is written)", () => {
    const dir = writeTree("demo-001");
    expect(ralphy(["catalog", "use", "text-pop", "--project", "demo-001", "--at", "0.3", "--duration", "1.2", "--param", "text=First"]).exitCode).toBe(0);
    const second = ralphy(["catalog", "use", "text-pop", "--project", "demo-001", "--duration", "1.2", "--param", "text=Second"]);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(second.json.copy).toMatchObject({ path: "compositions/catalog/text-pop.html", action: "reuse" });
    // --at defaults to the end of the last clip on the track: back to back.
    expect(second.json.clip).toMatchObject({ id: "catalog-text-pop-2", start: 1.5, duration: 1.2, track: 2 });

    const copyPath = path.join(dir, "compositions", "catalog", "text-pop.html");
    const edited = fs.readFileSync(copyPath, "utf8").replace("font-size: 150px", "font-size: 120px");
    fs.writeFileSync(copyPath, edited);
    const third = ralphy(["catalog", "use", "text-pop", "--project", "demo-001", "--at", "4", "--param", "text=Third"]);
    expect(third.exitCode, third.stderr).toBe(0);
    expect(third.json.copy).toMatchObject({ path: "compositions/catalog/text-pop.v2.html", action: "write" });
    expect(fs.readFileSync(copyPath, "utf8")).toBe(edited);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('data-composition-src="compositions/catalog/text-pop.v2.html"');
    // Earlier uses still point at the (edited) first copy.
    expect(html.match(/data-composition-src="compositions\/catalog\/text-pop\.html"/g)).toHaveLength(2);
    expect(usageRecords(dir).map((r) => r.copy)).toEqual([
      "compositions/catalog/text-pop.html",
      "compositions/catalog/text-pop.html",
      "compositions/catalog/text-pop.v2.html",
    ]);
  }, 120_000);

  test("coded errors for an unknown item, bad params, --at past the end, a missing index.html and a missing --from; nothing written", () => {
    const dir = writeTree("demo-001");
    fs.mkdirSync(projectTree("empty-001"), { recursive: true });
    const before = treeState(dir);
    const cases: Array<{ args: string[]; code: string; message: string }> = [
      { args: ["catalog", "use", "no-such-item", "--project", "demo-001"], code: "E_NOT_FOUND", message: "no-such-item" },
      { args: [...TRANSITION, "--param", "color=red"], code: "E_INPUT_INVALID", message: "#rrggbb" },
      { args: [...TRANSITION, "--param", "peak=9"], code: "E_INPUT_INVALID", message: "maximum 5" },
      { args: [...TRANSITION, "--param", "bogus=1"], code: "E_INPUT_INVALID", message: "no param 'bogus'" },
      { args: ["catalog", "use", "text-pop", "--project", "demo-001", "--at", "7"], code: "E_INPUT_INVALID", message: "past the composition length" },
      { args: ["catalog", "use", "text-pop", "--project", "demo-001", "--at", "5.5", "--duration", "2"], code: "E_INPUT_INVALID", message: "ends past the composition length" },
      { args: ["catalog", "use", "flash-white", "--project", "demo-001", "--to", "#s2"], code: "E_FLAG_MISSING", message: "--from" },
      { args: [...TRANSITION.slice(0, 7), "--from", "#nope", "--to", "#s2"], code: "E_INPUT_INVALID", message: "no element with id 'nope'" },
      { args: ["catalog", "use", "text-pop", "--project", "empty-001"], code: "E_FILE_UNREADABLE", message: "index.html" },
    ];
    for (const c of cases) {
      const r = ralphy(c.args);
      expect(r.exitCode, `${c.args.join(" ")}\n${r.stdout}`).not.toBe(0);
      const error = errorOf(r.stderr);
      expect(error.code, r.stderr).toBe(c.code);
      expect(error.message ?? "", r.stderr).toContain(c.message);
    }
    expect(treeState(dir)).toEqual(before);
    expect(fs.readdirSync(projectTree("empty-001"))).toEqual([]);
  }, 180_000);

  test("camera recipes: --target binds the host element; layer recipes need --bind bg; cam-follow is refused", () => {
    const dir = writeTree("demo-001");
    const punch = ralphy(["catalog", "use", "cam-punch-in", "--project", "demo-001", "--at", "0.5", "--target", "#s1", "--param", "mode=pulse"]);
    expect(punch.exitCode, punch.stderr).toBe(0);
    expect(punch.json).toMatchObject({ kind: "camera", context: { target: "#s1" }, params: { mode: "pulse" } });
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toContain('\\"target\\":\\"#s1\\"');

    const noTarget = ralphy(["catalog", "use", "cam-punch-in", "--project", "demo-001", "--at", "4"]);
    expect(errorOf(noTarget.stderr).code).toBe("E_FLAG_MISSING");
    const parallaxNoBg = ralphy(["catalog", "use", "cam-parallax", "--project", "demo-001", "--at", "1"]);
    expect(errorOf(parallaxNoBg.stderr)).toMatchObject({ code: "E_FLAG_MISSING" });
    expect(errorOf(parallaxNoBg.stderr).message).toContain("bind bg=");
    const parallax = ralphy(["catalog", "use", "cam-parallax", "--project", "demo-001", "--at", "1", "--bind", "bg=#s1", "--bind", "subject=#s2", "--dry-run"]);
    expect(parallax.exitCode, parallax.stderr).toBe(0);
    expect(parallax.json.context).toEqual({ bg: "#s1", subject: "#s2" });
    const badBind = ralphy(["catalog", "use", "text-pop", "--project", "demo-001", "--bind", "bg=#s1"]);
    expect(errorOf(badBind.stderr).code).toBe("E_INPUT_INVALID");
    const follow = ralphy(["catalog", "use", "cam-follow", "--project", "demo-001", "--target", "#s1"]);
    expect(errorOf(follow.stderr).code).toBe("E_INPUT_INVALID");
    expect(errorOf(follow.stderr).message).toContain("point track");
    expect(usageRecords(dir)).toHaveLength(1);
  }, 120_000);

  test("a missing SFX pack warns and the clip is silent", () => {
    const dir = writeTree("demo-001");
    fs.rmSync(path.join(tmp, ".ralphy", "catalog"), { recursive: true, force: true });
    const r = ralphy(TRANSITION);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.json.sfx).toBeNull();
    expect(r.json.warnings.join("\n")).toContain("SFX pack not found");
    expect(fs.existsSync(path.join(dir, "artifacts"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).not.toContain("<audio");
  });
});

describe("catalog use on a store root (#594, #591)", () => {
  test("the snapshot is the project-tree Composition revision; each use snapshots the tree it edits", () => {
    const created = ralphy(["new", "--id", "alpha-001"]);
    expect(created.exitCode, created.stderr).toBe(0);
    const projectId = created.json.id as string;
    const dir = writeTree("alpha-001");

    const plan = ralphy(["catalog", "use", "flash-white", "--project", "alpha-001", "--at", "2.8", "--from", "#s1", "--to", "#s2", "--dry-run"]);
    expect(plan.exitCode, plan.stderr).toBe(0);
    expect(plan.json.snapshot).toMatchObject({ kind: "composition-revision", compositionId: null, revisionId: null, revision: "create" });
    expect(ralphy(["composition", "list", "--project", projectId]).json.items).toEqual([]);

    const first = ralphy(["catalog", "use", "flash-white", "--project", "alpha-001", "--at", "2.8", "--from", "#s1", "--to", "#s2"]);
    expect(first.exitCode, first.stderr).toBe(0);
    expect(first.json.snapshot).toMatchObject({ kind: "composition-revision", revision: "create" });
    expect(first.json.snapshot.revisionId).toBeString();
    expect(fs.existsSync(path.join(dir, "compositions", "v1.html"))).toBe(false);
    expect(usageRecords(dir)[0]).toMatchObject({ projectId, item: "flash-white", snapshot: { revisionId: first.json.snapshot.revisionId } });

    const second = ralphy(["catalog", "use", "text-pop", "--project", "alpha-001", "--at", "4", "--duration", "1.5"]);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(second.json.snapshot).toMatchObject({ kind: "composition-revision", revision: "revise" });
    expect(second.json.snapshot.revisionId).not.toBe(first.json.snapshot.revisionId);

    const listed = ralphy(["composition", "list", "--project", projectId]);
    expect(listed.exitCode, listed.stderr).toBe(0);
    const video = (listed.json.items as Array<{ id: string; kind: string }>).find((item) => item.kind === "video")!;
    const shown = ralphy(["composition", "show", video.id]);
    expect(shown.exitCode, shown.stderr).toBe(0);
    const revisions = shown.json.revisions as Array<{ id: string; state: string; parentRevisionId: string | null }>;
    expect(revisions).toHaveLength(2);
    expect(revisions.find((rev) => rev.id === second.json.snapshot.revisionId)).toMatchObject({ state: "sealed", parentRevisionId: first.json.snapshot.revisionId });

    // render records the edited tree as the next revision.
    const render = ralphy(["render", "alpha-001", "--dry-run"]);
    expect(render.exitCode, render.stderr).toBe(0);
    expect(render.json.projectTree).toMatchObject({ revision: "revise" });
  }, 180_000);
});
