// `ralphy editor poster` (#598) through the real CLI entry.
//
// HOME is isolated and every root is a fresh temp dir holding the licensed
// font fixtures under `.ralphy/catalog/fonts/` and one project tree with a
// tiny English scenes file, one image, one referenced Lottie, one unreferenced
// Lottie and a generated WAV. Two roots: a tree-only root (no store; the
// snapshot is compositions/v<N>.html) and a store root (`ralphy new`; the
// snapshot is the #591 project-tree Composition revision). No renders, no
// network, no paid calls. The upstream `hyperframes lint` runs from
// node_modules when present.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const UPSTREAM_HF = path.join(REPO, "node_modules", ".bin", "hyperframes");
const LOTTIE = { v: "5.7.4", fr: 30, ip: 0, op: 30, w: 64, h: 64, layers: [] };

const SCENES = `// Two-scene smoke test for the poster-collage engine.
const ASSETS = {
  hero: "artifacts/images/hero.png",
  "lot-pop": "artifacts/animations/lot-pop.json",
  "lot-spare": "artifacts/animations/lot-spare.json"
};
const SCENES = [
  { t: 0, bg: "red", shake: [0.6], items: [
    { type: "kick", text: "the short version", x: 80, y: 250, w: 920, at: 0.1 },
    { type: "title", lines: ["BIG IDEA"], x: 60, y: 300, w: 960, size: 220, reveal: "scatter" },
    { type: "lottie", src: "lot-pop", x: 440, y: 900, w: 200, h: 200, at: 0.4 }
  ]},
  { t: 1.2, bg: "black", enter: "slide", items: [
    { type: "img", src: "hero", x: 140, y: 700, w: 800, h: 800, cls: "cut", land: 1.6 },
    { type: "stamp", text: "TRUE", x: 300, y: 400, at: 1.5, light: true }
  ]}
];
`;

let tmp: string;

/** A valid 16-bit mono PCM WAV of silence. */
function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-editor-poster-598-")));
  for (const id of ["oswald", "caveat", "inter"]) {
    const d = path.join(tmp, ".ralphy", "catalog", "fonts", id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `${id}.ttf`), `${id}-font-bytes`);
    fs.writeFileSync(path.join(d, "LICENSE.txt"), `${id}: SIL OPEN FONT LICENSE Version 1.1`);
  }
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function projectTree(name: string): string {
  return path.join(tmp, ".ralphy", "workspaces", "default", "projects", name);
}

function writeTree(name: string): string {
  const dir = projectTree(name);
  for (const sub of ["artifacts/images", "artifacts/animations", "artifacts/voiceover"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, "artifacts", "images", "hero.png"), "png-bytes");
  fs.writeFileSync(path.join(dir, "artifacts", "animations", "lot-pop.json"), JSON.stringify(LOTTIE));
  fs.writeFileSync(path.join(dir, "artifacts", "animations", "lot-spare.json"), JSON.stringify({ ...LOTTIE, nm: "spare-marker" }));
  fs.writeFileSync(path.join(dir, "artifacts", "voiceover", "vo.wav"), wav(2.5));
  fs.writeFileSync(path.join(dir, "poster-scenes.js"), SCENES);
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
      HYPERFRAMES_NO_UPDATE_CHECK: "1",
      HYPERFRAMES_NO_TELEMETRY: "1",
    },
    timeout: 120_000,
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
      else out[path.relative(dir, p)] = fs.readFileSync(p, "latin1");
    }
  };
  walk(dir);
  return out;
}

const POSTER = ["editor", "poster", "demo-001", "--scenes", "poster-scenes.js", "--audio", "artifacts/voiceover/vo.wav"];

describe("editor poster on a tree-only root (#598)", () => {
  test("--dry-run prints the plan and writes nothing", () => {
    const dir = writeTree("demo-001");
    const before = treeState(dir);
    const r = ralphy([...POSTER, "--duration", "2.5", "--dry-run"]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.json).toMatchObject({
      dryRun: true,
      compositionId: "demo-001",
      duration: 2.5,
      durationSource: "flag",
      scenes: { count: 2, items: 5 },
      assets: { missing: [], unused: ["lot-spare"] },
      lottie: { inlined: [{ key: "lot-pop", path: "artifacts/animations/lot-pop.json" }] },
      index: { path: "index.html", action: "create" },
      snapshot: null,
      lint: null,
    });
    expect(r.json.assets.referenced.map((a: { key: string }) => a.key)).toEqual(["hero", "lot-pop"]);
    expect(r.json.lottie.bytes).toBe(JSON.stringify(LOTTIE).length);
    expect(r.json.files.map((f: { path: string }) => f.path)).toEqual([
      "fonts/oswald.ttf", "fonts/oswald-LICENSE.txt", "fonts/caveat.ttf", "fonts/caveat-LICENSE.txt", "fonts/inter.ttf", "fonts/inter-LICENSE.txt", "index.html",
    ]);
    expect(treeState(dir)).toEqual(before);
  });

  test("writes index.html and fonts; a second run snapshots the first page before replacing it", () => {
    const dir = writeTree("demo-001");
    const hasFfprobe = Bun.which("ffprobe") !== null;
    const first = ralphy(hasFfprobe ? POSTER : [...POSTER, "--duration", "2.5"]);
    expect(first.exitCode, first.stderr).toBe(0);
    expect(first.json).toMatchObject({ dryRun: false, duration: 2.5, durationSource: hasFfprobe ? "audio" : "flag", snapshot: null, index: { action: "create" } });
    const html1 = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    expect(html1).toContain('data-composition-id="demo-001"');
    expect(html1).toContain('data-duration="2.5"');
    expect(html1).toContain('src="artifacts/voiceover/vo.wav"');
    expect(html1).toContain('"artifacts/animations/lot-pop.json":{');
    expect(html1).not.toContain("spare-marker");
    expect(html1).toContain("const OSWALD_ADV = {");
    for (const id of ["oswald", "caveat", "inter"]) {
      expect(fs.readFileSync(path.join(dir, "fonts", `${id}.ttf`), "utf8")).toBe(`${id}-font-bytes`);
      expect(fs.readFileSync(path.join(dir, "fonts", `${id}-LICENSE.txt`), "utf8")).toContain("SIL OPEN FONT LICENSE");
    }
    expect(first.json.lint.inRepo.ok).toBe(true);
    if (fs.existsSync(UPSTREAM_HF)) {
      expect(first.json.lint.upstream).toMatchObject({ ran: true, ok: true, errorCount: 0 });
      expect(first.json.lint.ok).toBe(true);
    }

    // Edit the scenes and a font, then build again.
    fs.writeFileSync(path.join(dir, "poster-scenes.js"), SCENES.replace("BIG IDEA", "BIGGER IDEA"));
    fs.writeFileSync(path.join(dir, "fonts", "inter.ttf"), "user-replaced-font");
    const second = ralphy([...POSTER, "--duration", "2.5", "--no-lint"]);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(second.json).toMatchObject({ snapshot: { kind: "file", path: "compositions/v1.html", action: "write" }, index: { action: "update" }, lint: { upstream: null } });
    expect(fs.readFileSync(path.join(dir, "compositions", "v1.html"), "utf8")).toBe(html1);
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toContain("BIGGER IDEA");
    expect(fs.readFileSync(path.join(dir, "fonts", "inter.ttf"), "utf8")).toBe("user-replaced-font");
    expect(second.json.fonts.every((f: { action: string }) => f.action === "keep")).toBe(true);
    expect(second.json.files.map((f: { path: string }) => f.path)).toEqual(["compositions/v1.html", "index.html"]);
  }, 180_000);

  test("coded errors for a missing asset, a src outside ASSETS, a scenes file without SCENES and a bad audio path; nothing written", () => {
    const dir = writeTree("demo-001");
    fs.writeFileSync(path.join(dir, "no-scenes.js"), 'const ASSETS = { hero: "artifacts/images/hero.png" };\n');
    fs.writeFileSync(path.join(dir, "unknown-src.js"), SCENES.replace('src: "hero"', 'src: "villain"'));
    fs.writeFileSync(path.join(dir, "missing-file.js"), SCENES.replace('hero: "artifacts/images/hero.png"', 'hero: "artifacts/images/gone.png"'));
    const before = treeState(dir);
    const base = ["editor", "poster", "demo-001", "--audio", "artifacts/voiceover/vo.wav", "--duration", "2.5", "--no-lint"];
    const cases: Array<{ args: string[]; code: string; message: string }> = [
      { args: [...base, "--scenes", "missing-file.js"], code: "E_FILE_UNREADABLE", message: "artifacts/images/gone.png" },
      { args: [...base, "--scenes", "unknown-src.js"], code: "E_FILE_MALFORMED", message: "'villain'" },
      { args: [...base, "--scenes", "no-scenes.js"], code: "E_FILE_MALFORMED", message: "SCENES is not defined" },
      { args: [...base, "--scenes", "nope.js"], code: "E_FILE_UNREADABLE", message: "nope.js" },
      { args: ["editor", "poster", "demo-001", "--scenes", "poster-scenes.js", "--audio", "../vo.wav", "--duration", "2"], code: "E_INPUT_INVALID", message: "inside the project" },
      { args: ["editor", "poster", "demo-001", "--scenes", "poster-scenes.js", "--audio", "artifacts/voiceover/none.wav", "--duration", "2"], code: "E_FILE_UNREADABLE", message: "none.wav" },
      { args: [...base.slice(0, 5), "--duration", "0", "--scenes", "poster-scenes.js"], code: "E_INPUT_INVALID", message: "positive number" },
      { args: ["editor", "poster", "ghost-999", "--scenes", "poster-scenes.js", "--audio", "a.wav", "--duration", "2"], code: "E_NOT_FOUND", message: "ghost-999" },
    ];
    for (const c of cases) {
      const r = ralphy(c.args);
      expect(r.exitCode, `${c.args.join(" ")}\n${r.stdout}`).not.toBe(0);
      const error = errorOf(r.stderr);
      expect(error.code, r.stderr).toBe(c.code);
      expect(error.message ?? "", r.stderr).toContain(c.message);
    }
    // A dry run lists the missing file instead of failing on it.
    const dry = ralphy([...base, "--scenes", "missing-file.js", "--dry-run"]);
    expect(dry.exitCode).toBe(1);
    expect(dry.json.assets.missing).toEqual([{ key: "hero", path: "artifacts/images/gone.png", reason: "file missing", uses: ["scene 2 (t=1.2) item 1 (img)"] }]);
    expect(treeState(dir)).toEqual(before);
  }, 180_000);
});

describe("editor poster on a store root (#598, #591)", () => {
  test("the snapshot of the previous index.html is the project-tree Composition revision", () => {
    const created = ralphy(["new", "--id", "alpha-001"]);
    expect(created.exitCode, created.stderr).toBe(0);
    const dir = writeTree("alpha-001");
    const args = ["editor", "poster", "alpha-001", "--scenes", "poster-scenes.js", "--audio", "artifacts/voiceover/vo.wav", "--duration", "2.5", "--no-lint"];

    const first = ralphy(args);
    expect(first.exitCode, first.stderr).toBe(0);
    expect(first.json).toMatchObject({ compositionId: "alpha-001", snapshot: null, index: { action: "create" } });
    const html1 = fs.readFileSync(path.join(dir, "index.html"), "utf8");

    fs.writeFileSync(path.join(dir, "poster-scenes.js"), SCENES.replace("BIG IDEA", "SECOND IDEA"));
    const plan = ralphy([...args, "--dry-run"]);
    expect(plan.exitCode, plan.stderr).toBe(0);
    expect(plan.json.snapshot).toMatchObject({ kind: "composition-revision", revisionId: null, revision: "create" });

    const second = ralphy(args);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(second.json.snapshot).toMatchObject({ kind: "composition-revision", revision: "create" });
    expect(second.json.snapshot.revisionId).toBeString();
    expect(fs.existsSync(path.join(dir, "compositions"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toContain("SECOND IDEA");
    expect(html1).toContain("BIG IDEA");

    // render records the edited tree as the next revision.
    const render = ralphy(["render", "alpha-001", "--dry-run"]);
    expect(render.exitCode, render.stderr).toBe(0);
    expect(render.json.projectTree).toMatchObject({ revision: "revise" });
  }, 180_000);
});
