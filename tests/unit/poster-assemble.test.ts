// #598 — `ralphy editor poster` assembler: the shell fill, the embedded engine
// and advance table, scenes evaluation and validation, Lottie inlining only
// for referenced files, font planning, and the snapshot-before-overwrite order.
// Pure / offline (temp dirs only).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BACKGROUNDS,
  ENTER_PRESETS,
  ICON_NAMES,
  ITEM_TYPES,
  OSWALD_ADVANCE,
  POSTER_ENGINE,
  POSTER_SHELL,
  PosterScenesError,
  SCENE_TRANSITIONS,
  SHELL_PLACEHOLDERS,
  buildPosterHtml,
  checkScenes,
  evaluateScenes,
  fillShell,
  scriptJson,
} from "../../cli/lib/poster/assemble.ts";
import { applyPosterPlan, assetLocation, fileSnapshot, planPoster, PosterAssetError } from "../../cli/lib/poster/project.ts";
import { lintHyperframesHtml } from "../../cli/lib/render/hyperframes-lint.ts";

const LOTTIE = { v: "5.7.4", fr: 30, ip: 0, op: 30, w: 64, h: 64, layers: [] };

const SCENES = `// test scenes
const ASSETS = {
  hero: "artifacts/images/hero.png",
  pop: "artifacts/animations/pop.json",
  spare: "artifacts/animations/spare.json"
};
const SCENES = [
  { t: 0, bg: "red", items: [
    { type: "title", lines: ["BIG IDEA"], x: 60, y: 300, w: 960, size: 200 },
    { type: "kick", text: "the short version", x: 80, y: 250, w: 920, at: 0.2 },
    { type: "lottie", src: "pop", x: 440, y: 900, w: 200, h: 200, at: 0.4 }
  ]},
  { t: 1.5, bg: "paper", enter: "slide", items: [
    { type: "img", src: "hero", x: 140, y: 700, w: 800, h: 800, cls: "cut", land: 2.0 },
    { type: "counter", to: 1200, suffix: "+", x: 80, y: 400, w: 920, size: 220, at: 1.8 }
  ]}
];
`;

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof PosterScenesError ? e.detail : String(e);
  }
  return "";
}

describe("embedded engine, shell and advance table", () => {
  test("enumerations are read from the engine and the shell", () => {
    expect(ITEM_TYPES).toEqual([
      "title", "kick", "script", "img", "lottie", "card", "icon", "bubbles", "grid", "counter", "people",
      "line", "arcs", "burst", "orbit", "box", "stamp", "bar", "paper", "scroll", "group",
    ]);
    expect(ENTER_PRESETS).toEqual(["pop", "drop", "left", "right", "rise", "zoom", "fade", "slam", "tilt", "flipY", "flipX"]);
    expect(ICON_NAMES).toContain("paw");
    expect(ICON_NAMES).toContain("check");
    expect(ICON_NAMES).toHaveLength(17);
    expect(SCENE_TRANSITIONS).toEqual(["zoomcut", "iris", "push", "slide", "glitch"]);
    expect(BACKGROUNDS).toEqual(["red", "blue", "black", "navy", "paper", "white", "beige", "sunset"]);
  });

  test("the engine keeps its render-safety mechanisms", () => {
    expect(POSTER_ENGINE).toContain("const LOT = window.lottie;");
    expect(POSTER_ENGINE).toContain("window.lottie = undefined");
    expect(POSTER_ENGINE).toContain("animationData: JSON.parse(JSON.stringify(inline))");
    expect(POSTER_ENGINE).toContain("immediateRender: false");
    expect(POSTER_ENGINE).toContain("gsap.set(e, { scaleX: -1 })");
    expect(POSTER_ENGINE).toContain("seed = seed0;");
    expect(POSTER_ENGINE).toContain("yPercent");
    expect(POSTER_ENGINE).toContain("document.fonts.ready.then(fitText)");
    expect(/[^\x00-\x7F]/.test(POSTER_ENGINE)).toBe(false);
  });

  test("the advance table is ASCII JSON covering Latin and Cyrillic", () => {
    expect(/[^\x00-\x7F]/.test(OSWALD_ADVANCE)).toBe(false);
    const table = JSON.parse(OSWALD_ADVANCE) as Record<string, number>;
    expect(table.A).toBeCloseTo(0.551);
    expect(table["\u0416"]).toBeGreaterThan(0.5);
    expect(Object.keys(table).length).toBeGreaterThan(200);
  });

  test("the shell carries every placeholder exactly where the assembler fills it", () => {
    for (const key of SHELL_PLACEHOLDERS) expect(POSTER_SHELL).toContain(`{{${key}}}`);
    expect(POSTER_SHELL).toContain('url("fonts/oswald.ttf")');
    expect(POSTER_SHELL).toContain('url("fonts/caveat.ttf")');
    expect(POSTER_SHELL).toContain('url("fonts/inter.ttf")');
  });

  test("every class the engine creates has a shell rule (an unstyled svg paints under the background)", () => {
    const classes = new Set<string>();
    for (const m of POSTER_ENGINE.matchAll(/mk\("\w+", "([^"]+)"/g)) for (const c of m[1]!.split(" ")) if (c && !c.endsWith("-")) classes.add(c);
    for (const m of POSTER_ENGINE.matchAll(/setAttribute\("class", "([^"]+)"\)/g)) classes.add(m[1]!);
    expect(classes.has("arcs")).toBe(true);
    const css = POSTER_SHELL.slice(POSTER_SHELL.indexOf("<style>"), POSTER_SHELL.indexOf("</style>"));
    const unstyled = [...classes].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(unstyled).toEqual([]);
    expect(css).toContain(".arcs path{fill:none");
  });
});

describe("buildPosterHtml", () => {
  const base = {
    scenesSource: SCENES,
    lottie: { "artifacts/animations/pop.json": LOTTIE },
    compositionId: "demo-001",
    duration: 3.25,
    lang: "en",
    title: "Dogs & cats",
    audioSrc: "artifacts/voiceover/vo.wav",
  };

  test("fills every placeholder and embeds data, advance table, Lottie and engine", () => {
    const html = buildPosterHtml(base);
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Dogs &amp; cats</title>");
    expect(html).toContain('data-composition-id="demo-001" data-width="1080" data-height="1920" data-start="0" data-duration="3.25"');
    expect(html).toContain('<audio id="track" data-start="0" data-duration="3.25" data-track-index="1" data-volume="1" src="artifacts/voiceover/vo.wav"></audio>');
    expect(html).toContain('const COMP_ID = "demo-001";');
    expect(html).toContain("const DURATION = 3.25;");
    expect(html).toContain(SCENES);
    expect(html).toContain(`const OSWALD_ADV = ${OSWALD_ADVANCE};`);
    expect(html).toContain('const LOTTIE_DATA = {"artifacts/animations/pop.json":{"v":"5.7.4"');
    expect(html).toContain(POSTER_ENGINE);
    expect(html.indexOf("const LOTTIE_DATA")).toBeLessThan(html.indexOf("const LOT = window.lottie"));
    expect(lintHyperframesHtml(html).ok).toBe(true);
  });

  test("inserted text is never read as a placeholder or a replacement pattern", () => {
    const tricky = `${SCENES}\nconst NOTE = "$& $1 $$ {{ENGINE}} {{TITLE}}";\n`;
    const html = buildPosterHtml({ ...base, scenesSource: tricky });
    expect(html).toContain('const NOTE = "$& $1 $$ {{ENGINE}} {{TITLE}}";');
    expect(html.split(POSTER_ENGINE)).toHaveLength(2);
  });

  test("a </script in the scenes code is refused; < in Lottie JSON is escaped", () => {
    expect(errorOf(() => buildPosterHtml({ ...base, scenesSource: `${SCENES}\nconst X = "</script>";` }))).toContain("</script");
    const html = buildPosterHtml({ ...base, lottie: { "artifacts/animations/pop.json": { ...LOTTIE, nm: "</script><b>" } } });
    expect(html).toContain("\\u003c/script>\\u003cb>");
    expect(scriptJson({ a: "<!--" })).toBe('{"a":"\\u003c!--"}');
  });

  test("fillShell refuses an unknown placeholder", () => {
    const values = Object.fromEntries(SHELL_PLACEHOLDERS.map((k) => [k, k.toLowerCase()])) as Parameters<typeof fillShell>[1];
    expect(fillShell("{{LANG}}/{{TITLE}}", values)).toBe("lang/title");
    expect(() => fillShell("{{NOPE}}", values)).toThrow("unknown placeholder");
  });
});

describe("evaluateScenes + checkScenes", () => {
  test("reads ASSETS and SCENES; DURATION and COMP_ID are defined for the scenes code", () => {
    const parsed = evaluateScenes(`const ASSETS = {};\nconst SCENES = [{ t: 0, items: [{ type: "kick", text: COMP_ID + " " + DURATION, at: 0 }] }];`, {
      compositionId: "x1",
      duration: 9,
    });
    expect((parsed.scenes[0]!.items as Array<{ text: string }>)[0]!.text).toBe("x1 9");
  });

  test("missing SCENES / ASSETS and broken code are scenes errors", () => {
    const opts = { compositionId: "x", duration: 5 };
    expect(errorOf(() => evaluateScenes("const ASSETS = {};", opts))).toContain("SCENES is not defined");
    expect(errorOf(() => evaluateScenes("const SCENES = [{ t: 0 }];", opts))).toContain("ASSETS is not defined");
    expect(errorOf(() => evaluateScenes("const ASSETS = {}; const SCENES = [];", opts))).toContain("non-empty array");
    expect(errorOf(() => evaluateScenes("const ASSETS = {; const SCENES = [];", opts))).toContain("failed to run");
    expect(errorOf(() => evaluateScenes("const ASSETS = { a: 1 }; const SCENES = [{ t: 0 }];", opts))).toContain("ASSETS.a");
  });

  test("referenced assets, unused keys, Lottie keys and the implicit paper texture", () => {
    const parsed = evaluateScenes(SCENES.replace('spare: "artifacts/animations/spare.json"', 'spare: "artifacts/animations/spare.json", paper: "artifacts/images/paper.jpg"'), { compositionId: "x", duration: 4 });
    const check = checkScenes(parsed, { duration: 4 });
    expect(check.sceneCount).toBe(2);
    expect(check.itemCount).toBe(5);
    expect(check.referenced.map((r) => r.key)).toEqual(["hero", "paper", "pop"]);
    expect(check.unused).toEqual(["spare"]);
    expect(check.lottieKeys).toEqual(["pop"]);
    expect(check.warnings).toEqual([]);
  });

  test("a src that is not in ASSETS is referenced with a null path", () => {
    const parsed = evaluateScenes(SCENES.replace('src: "hero"', 'src: "dog"'), { compositionId: "x", duration: 4 });
    const dog = checkScenes(parsed, { duration: 4 }).referenced.find((r) => r.key === "dog");
    expect(dog).toMatchObject({ path: null });
    expect(dog!.uses[0]).toContain("scene 2 (t=1.5) item 1 (img)");
  });

  test("structural defects are errors", () => {
    const check = (scenes: string) => errorOf(() => checkScenes(evaluateScenes(`const ASSETS = { a: "artifacts/images/a.png" };\nconst SCENES = ${scenes};`, { compositionId: "x", duration: 10 }), { duration: 10 }));
    expect(check(`[{ t: 0, items: [{ type: "sparkle" }] }]`)).toContain("unknown type 'sparkle'");
    expect(check(`[{ t: 0, items: [{ type: "title" }] }]`)).toContain("lines must be a non-empty array");
    expect(check(`[{ t: 0, items: [{ type: "icon", name: "unicorn", at: 0 }] }]`)).toContain("'unicorn' is not a built-in icon");
    expect(check(`[{ t: 2 }, { t: 1 }]`)).toContain("sorted by t");
    expect(check(`[{ t: 0, items: [{ type: "group", items: [{ type: "img", src: "a" }] }] }]`)).toContain("at (required inside a group, paper or scroll)");
    expect(check(`[{ t: 0, items: [{ type: "bubbles", list: [{ text: "hi" }] }] }]`)).toContain("list[0].at");
    // A nested title whose lines carry their own times needs no `at`.
    expect(check(`[{ t: 0, items: [{ type: "paper", w: 900, h: 900, at: 0, items: [{ type: "title", lines: [{ t: "OK", at: 0.5 }] }] }] }]`)).toBe("");
  });

  test("values the engine silently ignores are warnings", () => {
    const parsed = evaluateScenes(
      `const ASSETS = { a: "artifacts/images/a.png" };
const SCENES = [{ t: 0, bg: "green", enter: "spin", items: [{ type: "img", id: "pic", src: "a", anim: "bounce" }], shatter: [{ target: "nope", at: 1 }] }, { t: 12 }];`,
      { compositionId: "x", duration: 10 },
    );
    const { warnings } = checkScenes(parsed, { duration: 10 });
    expect(warnings.join("\n")).toContain("bg 'green'");
    expect(warnings.join("\n")).toContain("enter 'spin'");
    expect(warnings.join("\n")).toContain("anim 'bounce'");
    expect(warnings.join("\n")).toContain("shatter target 'nope'");
    expect(warnings.join("\n")).toContain("scene 2 starts at 12s");
  });
});

describe("planPoster + applyPosterPlan (temp project)", () => {
  let tmp: string;
  let dir: string;
  let fontsDir: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-poster-unit-")));
    dir = path.join(tmp, "project");
    fontsDir = path.join(tmp, "fonts-data");
    fs.mkdirSync(path.join(dir, "artifacts", "images"), { recursive: true });
    fs.mkdirSync(path.join(dir, "artifacts", "animations"), { recursive: true });
    fs.writeFileSync(path.join(dir, "artifacts", "images", "hero.png"), "png-bytes");
    fs.writeFileSync(path.join(dir, "artifacts", "animations", "pop.json"), JSON.stringify(LOTTIE));
    fs.writeFileSync(path.join(dir, "artifacts", "animations", "spare.json"), JSON.stringify({ ...LOTTIE, nm: "spare" }));
    for (const id of ["oswald", "caveat", "inter"]) {
      fs.mkdirSync(path.join(fontsDir, id), { recursive: true });
      fs.writeFileSync(path.join(fontsDir, id, `${id}.ttf`), `${id}-font`);
      fs.writeFileSync(path.join(fontsDir, id, "LICENSE.txt"), `${id} SIL OPEN FONT LICENSE Version 1.1`);
    }
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const plan = (scenesSource = SCENES) =>
    planPoster({
      projectDir: dir,
      scenesFile: "poster-scenes.js",
      scenesSource,
      compositionId: "demo-001",
      duration: 3,
      lang: "en",
      title: "demo",
      audioSrc: "artifacts/voiceover/vo.wav",
      fontsDataDir: fontsDir,
    });

  test("Lottie is inlined only for referenced files; the plan lists assets and fonts", async () => {
    const p = await plan();
    expect(p.lottie.inlined).toEqual([{ key: "pop", path: "artifacts/animations/pop.json", bytes: JSON.stringify(LOTTIE).length }]);
    expect(p.html).toContain('"artifacts/animations/pop.json":{');
    expect(p.html).not.toContain("artifacts/animations/spare.json\":{");
    expect(p.html).not.toContain('"nm":"spare"');
    expect(p.assets.referenced.map((r) => r.key)).toEqual(["hero", "pop"]);
    expect(p.assets.missing).toEqual([]);
    expect(p.assets.unused).toEqual(["spare"]);
    expect(p.fonts.map((f) => `${f.file}:${f.action}`)).toEqual([
      "fonts/oswald.ttf:copy", "fonts/oswald-LICENSE.txt:copy",
      "fonts/caveat.ttf:copy", "fonts/caveat-LICENSE.txt:copy",
      "fonts/inter.ttf:copy", "fonts/inter-LICENSE.txt:copy",
    ]);
    expect(p.index).toMatchObject({ path: "index.html", action: "create" });
    expect(p.previousIndex).toBeNull();
    expect(p.scenes).toMatchObject({ file: "poster-scenes.js", count: 2, items: 5 });
  });

  test("missing files, unknown keys and paths outside the project are listed, not thrown", async () => {
    fs.rmSync(path.join(dir, "artifacts", "images", "hero.png"));
    const p = await plan(SCENES.replace('src: "pop"', 'src: "ghost"').replace('spare: "artifacts/animations/spare.json"', 'spare: "../outside.png"').replace('src: "hero"', 'src: "spare"'));
    expect(p.assets.missing.map((m) => `${m.key}:${m.reason}`)).toEqual(["ghost:not in ASSETS", "spare:outside the project"]);
    const q = await plan();
    expect(q.assets.missing).toEqual([{ key: "hero", path: "artifacts/images/hero.png", reason: "file missing", uses: ["scene 2 (t=1.5) item 1 (img)"] }]);
    expect(assetLocation(dir, "https://example.com/a.png")).toEqual({ kind: "remote" });
    expect(assetLocation(dir, "/etc/hosts")).toEqual({ kind: "outside" });
  });

  test("a Lottie file without a frame range is malformed", async () => {
    fs.writeFileSync(path.join(dir, "artifacts", "animations", "pop.json"), JSON.stringify({ hello: 1 }));
    await expect(plan()).rejects.toBeInstanceOf(PosterAssetError);
  });

  test("the previous index.html is snapshotted before it is overwritten; fonts are never overwritten", async () => {
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><p>OLD</p>");
    fs.mkdirSync(path.join(dir, "fonts"));
    fs.writeFileSync(path.join(dir, "fonts", "oswald.ttf"), "user-edited-font");
    const first = await plan();
    expect(first.index.action).toBe("update");
    expect(first.fonts.find((f) => f.file === "fonts/oswald.ttf")!.action).toBe("keep");

    const seen: Array<{ index: string; fonts: boolean }> = [];
    const files = fileSnapshot(dir);
    const applied = await applyPosterPlan(dir, first, async (previous) => {
      seen.push({ index: fs.readFileSync(path.join(dir, "index.html"), "utf8"), fonts: fs.existsSync(path.join(dir, "fonts", "inter.ttf")) });
      expect(previous).toBe("<!doctype html><p>OLD</p>");
      return files(previous);
    });
    // The snapshot ran while index.html still held the old page and before any copy.
    expect(seen).toEqual([{ index: "<!doctype html><p>OLD</p>", fonts: false }]);
    expect(applied.snapshot).toEqual({ kind: "file", path: "compositions/v1.html", action: "write" });
    expect(fs.readFileSync(path.join(dir, "compositions", "v1.html"), "utf8")).toBe("<!doctype html><p>OLD</p>");
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toBe(first.html);
    expect(fs.readFileSync(path.join(dir, "fonts", "oswald.ttf"), "utf8")).toBe("user-edited-font");
    expect(fs.readFileSync(path.join(dir, "fonts", "inter.ttf"), "utf8")).toBe("inter-font");
    expect(fs.readFileSync(path.join(dir, "fonts", "inter-LICENSE.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE");
    expect(applied.files.map((f) => f.path)).toEqual([
      "compositions/v1.html",
      "fonts/oswald-LICENSE.txt",
      "fonts/caveat.ttf",
      "fonts/caveat-LICENSE.txt",
      "fonts/inter.ttf",
      "fonts/inter-LICENSE.txt",
      "index.html",
    ]);

    // A second build snapshots the first build's page as v2; v1 is untouched.
    const second = await plan(SCENES.replace("BIG IDEA", "BIGGER IDEA"));
    const again = await applyPosterPlan(dir, second, fileSnapshot(dir));
    expect(again.snapshot).toEqual({ kind: "file", path: "compositions/v2.html", action: "write" });
    expect(fs.readFileSync(path.join(dir, "compositions", "v2.html"), "utf8")).toBe(first.html);
    expect(fs.readFileSync(path.join(dir, "compositions", "v1.html"), "utf8")).toBe("<!doctype html><p>OLD</p>");
    expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toContain("BIGGER IDEA");
  });

  test("no previous index.html: no snapshot", async () => {
    const p = await plan();
    let called = false;
    const applied = await applyPosterPlan(dir, p, async () => {
      called = true;
      return {};
    });
    expect(called).toBe(false);
    expect(applied.snapshot).toBeNull();
    expect(fs.existsSync(path.join(dir, "compositions"))).toBe(false);
  });
});
