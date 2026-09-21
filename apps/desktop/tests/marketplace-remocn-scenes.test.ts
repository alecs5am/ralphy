/**
 * Conformance for the ported Remocn scene registry.
 *
 * "Every component looks like itself" is asserted here mechanically instead of hoped for. Measured
 * baseline of the system being replaced: 94 distinct scenes across 222 components, 149 of them
 * wearing another component's look. Below, any two scenes that share a body or a rule block fail.
 *
 * The registry lands one shard at a time, so every assertion iterates `allScenes()` at whatever
 * size it currently has. The single committed number is what a landing shard raises.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { allScenes, sceneMarkup, type SceneSpec } from "@/pages/marketplace/lib/scenes";
import { sceneContext, type SceneParams } from "@/pages/marketplace/lib/scenes/shared";

/**
 * How many scenes the registry is expected to hold. The integrator raises this once per landing
 * wave; a shard author never edits it, because parallel authors would collide on this one line.
 * While authoring, run with `REMOCN_SCENES_EXPECT=<n>` to check your own shard without touching it.
 */
const EXPECTED_SCENE_COUNT = Number(process.env.REMOCN_SCENES_EXPECT ?? 48);

/** 90 motion components (104 minus the 14 `guides` docs, decision D2) plus 118 foundations. */
const CATALOG_SIZE = 208;

const SCENES_DIR = resolve("src/pages/marketplace/lib/scenes");
const GENERATED = resolve("src/pages/marketplace/lib/generated");
const read = (path: string) => readFileSync(path, "utf8");
const load = <T>(file: string): T => JSON.parse(read(resolve(GENERATED, file))) as T;
const uncomment = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
/** CSS has no `//` comment, so stripping one would swallow the rest of a line carrying a URL. */
const uncss = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `.ts` in the scenes tree, including the `canvas/`, `paper/` and `webgl/` paint engines. */
const sceneSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sceneSources(path) : entry.name.endsWith(".ts") ? [path] : [];
  });

/** Upstream id -> the component's own embedded source text. The only truth about what exists. */
const upstream = new Map<string, string>();
for (const row of load<{ slug: string; group: string; source: string }[]>("remocn-motion-data.json")) {
  if (row.group !== "guides") upstream.set(row.slug, row.source);
}
for (const row of load<{ name: string; files: { content: string }[] }[]>("remocn-foundations.generated.json")) {
  upstream.set(row.name, row.files.map((file) => file.content).join("\n"));
}

const TITLE = "Conformance Title";
const OPTIONS = { title: TITLE, summary: "conformance", format: "portrait" } as const;
const scenes = allScenes();

/**
 * One scene's body. The chrome and the title are identical for every scene here — one constant
 * title is passed to all of them — so neither can stand in for a component actually looking
 * different. The id is stripped too, so a scoped selector or a namespaced class cannot fake it.
 */
const bodyOf = (spec: SceneSpec) =>
  sceneMarkup(spec, OPTIONS)
    .replace(/<span class="rv-(?:kicker|caption|index)">[\s\S]*?<\/span>/g, "")
    .split(TITLE).join("")
    .split(spec.id).join("")
    .replace(/\s+/g, " ")
    .trim();

/** One scene's rules, read out of the shard it declares — never out of a neighbour's file. */
const blockOf = (spec: SceneSpec) => {
  const opening = `/* @scene ${spec.id} */`;
  const sheet = read(resolve(SCENES_DIR, `${spec.shard}.css`));
  const start = sheet.indexOf(opening);
  if (start < 0) return "";
  const end = sheet.indexOf("/* @end */", start);
  return sheet.slice(start + opening.length, end < 0 ? undefined : end).trim();
};

const bump = (value: SceneParams[string]): SceneParams[string] =>
  typeof value === "number" ? value + 1
    : typeof value === "boolean" ? !value
      : typeof value === "string" ? `${value}~`
        // An empty list has nothing to bump, so lengthen it instead: perturbing it in place is a
        // no-op, and a scene that reads it honestly would be reported as ignoring its params.
        : value.length === 0 ? [0]
          : value.map((item) => (typeof item === "number" ? item + 1 : `${item}~`));

const perturb = (params: SceneParams): SceneParams =>
  Object.fromEntries(Object.entries(params).map(([key, value]) => [key, bump(value)]));

test("the registry is the agreed size and only ever names real upstream components", () => {
  expect(scenes).toHaveLength(EXPECTED_SCENE_COUNT);
  expect(EXPECTED_SCENE_COUNT).toBeLessThanOrEqual(CATALOG_SIZE);
  expect(upstream.size).toBe(CATALOG_SIZE);
  expect(new Set(scenes.map((spec) => spec.id)).size).toBe(scenes.length);
  for (const spec of scenes) expect(upstream.has(spec.id), `invented id: ${spec.id}`).toBe(true);
});

test("every declared param is a prop default in that component's own upstream source", () => {
  for (const spec of scenes) {
    const source = upstream.get(spec.id) ?? "";
    for (const key of Object.keys(spec.params)) {
      const declared = new RegExp(`(^|[^\\w$])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\??\\s*[=:]`);
      expect(declared.test(source), `${spec.id}: param "${key}" is not a prop of the upstream component`).toBe(true);
    }
  }
});

test("no two scenes share a body or a rule block, and none of them is empty", () => {
  const bodies = scenes.map(bodyOf);
  const blocks = scenes.map((spec) => blockOf(spec).split(spec.id).join("").replace(/\s+/g, " ").trim());
  for (let index = 0; index < scenes.length; index += 1) {
    const id = scenes[index]!.id;
    expect(bodies[index]!.length, `${id}: renders nothing`).toBeGreaterThan(0);
    expect(blocks[index]!.length, `${id}: has no /* @scene ${id} */ block in ${scenes[index]!.shard}.css`).toBeGreaterThan(0);
  }
  expect(new Set(bodies).size, "two scenes render the same body").toBe(scenes.length);
  expect(new Set(blocks).size, "two scenes carry the same rules").toBe(scenes.length);
});

test("markup is pure, and a CSS-only scene really reads the params it declares", () => {
  for (const spec of scenes) {
    expect(sceneMarkup(spec, OPTIONS), `${spec.id}: markup is not pure`).toBe(sceneMarkup(spec, OPTIONS));
    // A scene with a paint engine may legitimately ignore its params: the engine owns those pixels.
    // Without one, a param the markup never reads is decoration — exactly the fabrication we block.
    if (spec.paint || Object.keys(spec.params).length === 0) continue;
    const context = sceneContext(spec, { title: TITLE, format: "portrait" });
    const moved = spec.markup(context, perturb(spec.params));
    expect(moved, `${spec.id}: markup ignores every param it declares`).not.toBe(spec.markup(context, spec.params));
  }
});

test("nothing under lib/scenes reaches for a random number", () => {
  const sources = sceneSources(SCENES_DIR);
  expect(sources.length, "the scan found no scene sources at all").toBeGreaterThan(0);
  for (const path of sources) {
    expect(uncomment(read(path)).includes("Math.random"), path.slice(SCENES_DIR.length + 1)).toBe(false);
  }
});

/**
 * Upstream is genuinely motionless for these, checked against the embedded source: each is a
 * `filters` component whose whole effect is one fragment shader with no time uniform, no
 * `useCurrentFrame()` and no `interpolate()`. CI must never push an author to invent movement to
 * satisfy a coverage number, so their stillness is asserted rather than merely tolerated.
 *
 * Nothing else in the catalog qualifies today. `launch-anything` reads `useCurrentFrame()` and
 * drives a `Sequence` timeline, so it is not static. `changelog-video`, `showcase-reel` and
 * `product-demo` are `guides` docs that decision D2 removes from the catalog, so naming them here
 * could only ever be inert. `canvas-presentation`'s embedded `source` is a GitHub 404 body, so
 * nothing about it can be verified in either direction.
 */
const MOTIONLESS = ["ascii-render", "camera-lens", "halftone-print", "pixelate-region"] as const;

test("a static spec animates nothing, and the known-motionless components stay static", () => {
  const byId = new Map(scenes.map((spec) => [spec.id, spec] as const));
  for (const id of MOTIONLESS) {
    const spec = byId.get(id);
    if (spec) expect(spec.motion.kind, `${id} is motionless upstream`).toBe("static");
  }
  for (const spec of scenes) {
    if (spec.motion.kind !== "static") continue;
    const animated = /(^|[;{}\s])animation(-[a-z-]+)?\s*:/.test(uncss(blockOf(spec)));
    expect(animated, `${spec.id}: declared static but its CSS animates`).toBe(false);
  }
});

test("every spec declares a real stage, a still inside the run, and an honest fidelity note", () => {
  for (const spec of scenes) {
    expect(spec.stage.w, `${spec.id}: stage width`).toBeGreaterThan(0);
    expect(spec.stage.h, `${spec.id}: stage height`).toBeGreaterThan(0);
    expect(spec.still, `${spec.id}: still must sit inside the run`).toBeGreaterThan(0);
    expect(spec.still, `${spec.id}: still must sit inside the run`).toBeLessThan(1);
    if (!spec.fidelity) continue;
    expect(spec.fidelity.level, `${spec.id}: a verbatim port declares no fidelity`).not.toBe("verbatim");
    expect(spec.fidelity.note.length, `${spec.id}: say what actually differs`).toBeGreaterThanOrEqual(40);
  }
});
