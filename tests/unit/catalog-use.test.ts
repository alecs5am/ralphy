// #594 — `ralphy catalog use` library: param validation, word timings, reading
// and editing the host composition, clip timing, the sub-composition file, and
// append-only file placement. Pure / offline.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CatalogManifestSchema } from "../../cli/lib/catalog/schema.ts";
import { fragmentPath } from "../../cli/lib/catalog/manifest.ts";
import { parseFragment } from "../../cli/lib/catalog/harness.ts";
import {
  CatalogUseInputError,
  actsOnHost,
  buildSubComposition,
  catalogBaseTrack,
  clipMarkup,
  compositionLength,
  insertIntoRoot,
  inspectComposition,
  nextUseId,
  parseWordTimings,
  placeVersioned,
  planClip,
  planFileSnapshot,
  planSfxTrack,
  resolveParams,
  sha256,
} from "../../cli/lib/catalog/use.ts";
import { lintHyperframesHtml } from "../../cli/lib/render/hyperframes-lint.ts";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CATALOG = path.join(REPO, "catalog");
const manifest = CatalogManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(CATALOG, "manifest.json"), "utf-8")));
const item = (id: string) => manifest.items.find((i) => i.id === id)!;

const HOST = `<!doctype html>
<html>
  <body>
    <template id="card-template"><div data-composition-id="card" data-start="0" data-duration="9" data-track-index="7"></div></template>
    <div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="8">
      <div id="s1" class="clip" data-start="0" data-duration="4" data-track-index="0"></div>
      <div id="s2" class="clip" data-start="4" data-duration="4" data-track-index="0"></div>
      <audio id="vo" data-start="0" data-track-index="1" src="vo.mp3"></audio>
    </div>
    <script>window.__timelines = { main: null };</script>
  </body>
</html>
`;

function expectInputError(fn: () => unknown, field: string, detail: string | RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CatalogUseInputError);
    expect((e as CatalogUseInputError).field).toBe(field);
    if (typeof detail === "string") expect((e as CatalogUseInputError).detail).toContain(detail);
    else expect((e as CatalogUseInputError).detail).toMatch(detail);
    return;
  }
  throw new Error("expected a CatalogUseInputError");
}

describe("resolveParams (#594)", () => {
  test("defaults every declared param and coerces --param values by type", () => {
    const { values, explicit } = resolveParams(item("flash-white"), ["peak=4.5", "color=#A1B2C3"]);
    expect(values).toEqual({ duration: 0.4, peak: 4.5, color: "#A1B2C3" });
    expect([...explicit].sort()).toEqual(["color", "peak"]);
    expect(resolveParams(item("text-pop"), ["text=a=b c"]).values.text).toBe("a=b c");
  });

  test("refuses out-of-range numbers, bad colours, unknown enum values, unknown keys and malformed pairs", () => {
    expectInputError(() => resolveParams(item("flash-white"), ["peak=9"]), "param peak", "above the maximum 5");
    expectInputError(() => resolveParams(item("flash-white"), ["peak=1"]), "param peak", "below the minimum 1.5");
    expectInputError(() => resolveParams(item("flash-white"), ["peak=lots"]), "param peak", "expected a number");
    expectInputError(() => resolveParams(item("flash-white"), ["color=white"]), "param color", "#rrggbb");
    const enumItem = manifest.items.find((i) => i.params.some((p) => p.type === "enum"))!;
    const enumParam = enumItem.params.find((p) => p.type === "enum")!;
    expectInputError(() => resolveParams(enumItem, [`${enumParam.id}=nope`]), `param ${enumParam.id}`, "is not one of");
    const boolItem = manifest.items.find((i) => i.params.some((p) => p.type === "boolean"))!;
    const boolParam = boolItem.params.find((p) => p.type === "boolean")!;
    expect(resolveParams(boolItem, [`${boolParam.id}=false`]).values[boolParam.id]).toBe(false);
    expectInputError(() => resolveParams(boolItem, [`${boolParam.id}=yes`]), `param ${boolParam.id}`, "true or false");
    expectInputError(() => resolveParams(item("flash-white"), ["bogus=1"]), "param bogus", "no param 'bogus'");
    expectInputError(() => resolveParams(item("flash-white"), ["peak"]), "param", "key=value");
  });
});

describe("parseWordTimings (#594)", () => {
  test("accepts seconds, ms (generate captions output) and a words array; sorts by start", () => {
    expect(parseWordTimings([{ text: "b", start: 0.5, end: 0.7 }, { text: "a", start: 0.1, end: 0.3 }])).toEqual([
      { text: "a", start: 0.1, end: 0.3 },
      { text: "b", start: 0.5, end: 0.7 },
    ]);
    expect(parseWordTimings({ captions: [{ text: " hi ", startMs: 120, endMs: 480, timestampMs: null, confidence: 1 }] })).toEqual([{ text: "hi", start: 0.12, end: 0.48 }]);
    expect(parseWordTimings({ words: [{ text: "x", start: 0, end: 0 }] })).toHaveLength(1);
  });

  test("refuses empty lists, empty text and inverted times", () => {
    expect(() => parseWordTimings([])).toThrow("no words");
    expect(() => parseWordTimings({ foo: [] })).toThrow("words / captions");
    expect(() => parseWordTimings([{ text: "", start: 0, end: 1 }])).toThrow("non-empty");
    expect(() => parseWordTimings([{ text: "a", start: 2, end: 1 }])).toThrow("start <= end");
  });
});

describe("reading and editing the host composition (#594)", () => {
  test("finds the root outside <template>, its timed clips and every id", () => {
    const info = inspectComposition(HOST);
    expect(info.root).toEqual({ compositionId: "main", duration: 8, width: 1080, height: 1920 });
    expect(info.clips.map((c) => c.id)).toEqual(["s1", "s2", "vo"]);
    expect(info.clips[2]).toMatchObject({ tag: "audio", start: 0, duration: null, track: 1, catalogUse: null });
    expect(info.ids.has("s2")).toBe(true);
    expect(info.compositionIds.has("card")).toBe(true);
    expect(compositionLength(info)).toBe(8);
    expect(catalogBaseTrack(info)).toBe(2);
  });

  test("insertIntoRoot appends inside the root, indented, and leaves the rest byte-identical", () => {
    const out = insertIntoRoot(HOST, ['<div id="a"></div>', '<audio id="b"></audio>']);
    expect(out).toBe(
      HOST.replace(
        '<audio id="vo" data-start="0" data-track-index="1" src="vo.mp3"></audio>\n    </div>',
        '<audio id="vo" data-start="0" data-track-index="1" src="vo.mp3"></audio>\n      <div id="a"></div>\n      <audio id="b"></audio>\n    </div>',
      ),
    );
  });

  test("nextUseId skips ids and composition ids already in the document", () => {
    const html = HOST.replace('id="s1"', 'id="catalog-text-pop-1"').replace('data-composition-id="card"', 'data-composition-id="catalog-text-pop-2"');
    expect(nextUseId(inspectComposition(html), item("text-pop"))).toBe("catalog-text-pop-3");
  });
});

describe("planClip (#594)", () => {
  const info = inspectComposition(HOST);

  test("defaults: catalog base track, appended at the end of the last clip on it", () => {
    expect(planClip({ info, length: 8, duration: 0.75 })).toEqual({ start: 0, duration: 0.75, end: 0.75, track: 2 });
    const withUse = inspectComposition(insertIntoRoot(HOST, ['<div id="u1" data-start="1" data-duration="2" data-track-index="2" data-catalog-use="u1"></div>']));
    // A catalog clip does not move the base track; the next use appends after it.
    expect(catalogBaseTrack(withUse)).toBe(2);
    expect(planClip({ info: withUse, length: 8, duration: 1 })).toEqual({ start: 3, duration: 1, end: 4, track: 2 });
    // An explicit --at that overlaps it moves to the next free track.
    expect(planClip({ info: withUse, length: 8, duration: 1, at: 2.5 }).track).toBe(3);
  });

  test("explicit --track: append default and the overlap refusal", () => {
    // Track 1 holds the voice-over with no data-duration: it runs to the end.
    expectInputError(() => planClip({ info, length: 8, duration: 1, track: 1 }), "at", "full up to 8s");
    expectInputError(() => planClip({ info, length: 8, duration: 1, at: 3.5, track: 0 }), "track", "already has s1 at [0s, 4s)");
    expect(planClip({ info, length: 8, duration: 1, at: 2, track: 5 })).toEqual({ start: 2, duration: 1, end: 3, track: 5 });
  });

  test("refuses --at at or past the length, and a clip running past it", () => {
    expectInputError(() => planClip({ info, length: 8, duration: 1, at: 8 }), "at", "--at 8 is past the composition length (8s)");
    expectInputError(() => planClip({ info, length: 8, duration: 2, at: 7 }), "duration", "ends past the composition length");
  });

  test("the SFX track is the first free one above the clip", () => {
    const clip = planClip({ info, length: 8, duration: 0.4, at: 3.8 });
    expect(planSfxTrack(info, 8, clip, 3.95, 4.85)).toBe(3);
  });
});

describe("clip markup and the sub-composition file (#594)", () => {
  test("the host carries a unique composition id and params that survive quotes, apostrophes and ampersands", () => {
    const markup = clipMarkup({
      useId: "catalog-text-pop-1",
      item: item("text-pop"),
      src: "compositions/catalog/text-pop.html",
      clip: { start: 1, duration: 2, end: 3, track: 2 },
      values: { text: `It's "big" & <bold>`, color: "#ffd166", stroke: 10, y: 420 },
      context: {},
    });
    expect(markup).toStartWith('<div id="catalog-text-pop-1" data-composition-id="catalog-text-pop-1" data-composition-src="compositions/catalog/text-pop.html" data-start="1" data-duration="2" data-track-index="2"');
    const raw = /data-variable-values='([^']*)'/.exec(markup)![1]!;
    const decoded = JSON.parse(raw.replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
    expect(decoded).toEqual({ text: `It's "big" & <bold>`, color: "#ffd166", stroke: 10, y: 420, catalogContext: "{}" });
  });

  test("every catalog item builds a deterministic sub-composition that passes the in-repo lint", () => {
    for (const it of manifest.items) {
      const fragment = fs.readFileSync(fragmentPath(it, CATALOG), "utf-8");
      const html = buildSubComposition(it, fragment);
      expect(buildSubComposition(it, fragment)).toBe(html);
      expect(html, it.id).toContain(`function ${it.fn}(tl, o)`);
      expect(html, it.id).toContain(`${it.fn}(tl, o);`);
      expect(html, it.id).toContain(`<template id="catalog-${it.id}-template">`);
      // No composition id of its own: each host supplies a unique one.
      expect(html, it.id).not.toContain("data-composition-id=\"");
      expect(html, it.id).toContain("window.__timelines[");
      const declared = JSON.parse(/data-composition-variables='([^']*)'/.exec(html)![1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
      expect(declared.map((v: { id: string }) => v.id)).toEqual([...it.params.map((p) => p.id), "catalogContext"]);
      // Host-acting kinds put their CSS on the page; the others keep a scoped <style>.
      const hasCss = parseFragment(fragment).css !== "";
      expect(html.includes("data-catalog-css"), it.id).toBe(actsOnHost(it) && hasCss);
      expect(html.includes("<style>"), it.id).toBe(!actsOnHost(it) && hasCss);
      expect(lintHyperframesHtml(html).ok, it.id).toBe(true);
    }
  });

  test("a fragment without its function is refused", () => {
    expect(() => buildSubComposition(item("text-pop"), "<script data-catalog-js>function other() {}</script>")).toThrow("must define function catalog_text_pop");
  });
});

describe("append-only placement (#594)", () => {
  test("placeVersioned reuses identical bytes and never touches a different file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-catalog-use-unit-"));
    try {
      expect(await placeVersioned(dir, "x", ".html", sha256("A"))).toEqual({ name: "x.html", action: "write" });
      fs.writeFileSync(path.join(dir, "x.html"), "A");
      expect(await placeVersioned(dir, "x", ".html", sha256("A"))).toEqual({ name: "x.html", action: "reuse" });
      expect(await placeVersioned(dir, "x", ".html", sha256("B"))).toEqual({ name: "x.v2.html", action: "write" });
      fs.writeFileSync(path.join(dir, "x.v2.html"), "B");
      expect(await placeVersioned(dir, "x", ".html", sha256("B"))).toEqual({ name: "x.v2.html", action: "reuse" });
      expect(await placeVersioned(dir, "x", ".html", sha256("C"))).toEqual({ name: "x.v3.html", action: "write" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("planFileSnapshot numbers v<N>.html past the newest and reuses it when it holds the same bytes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-catalog-use-snap-"));
    try {
      expect(await planFileSnapshot(dir, "one")).toEqual({ path: "compositions/v1.html", action: "write" });
      fs.mkdirSync(path.join(dir, "compositions", "catalog"), { recursive: true });
      fs.writeFileSync(path.join(dir, "compositions", "v1.html"), "one");
      fs.writeFileSync(path.join(dir, "compositions", "v3.html"), "three");
      fs.writeFileSync(path.join(dir, "compositions", "catalog", "v9.html"), "not a snapshot");
      expect(await planFileSnapshot(dir, "three")).toEqual({ path: "compositions/v3.html", action: "reuse" });
      expect(await planFileSnapshot(dir, "one")).toEqual({ path: "compositions/v4.html", action: "write" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
