// #565 — free font library: license manifest, OpenType coverage parsing,
// font pairs, the unlicensed-font lint, and @font-face wiring. Offline: the
// binaries are not needed (a synthetic TTF exercises the cmap parser).

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ALLOWED_FONT_LICENSES,
  COVERAGE_SETS,
  coverageFor,
  fontFacesForHtml,
  fontFamilyDeclarations,
  FontManifestSchema,
  lintFontManifest,
  parseFont,
  rawSourceUrl,
} from "../../cli/lib/catalog/fonts.ts";
import { HARNESS_CSS } from "../../cli/lib/catalog/harness.ts";
import { buildFontPairHtml } from "../../cli/lib/catalog/font-pairs.ts";
import { CAPTION_SAMPLE, FONT_PAIR_SAMPLE, captionSampleWords } from "../../cli/lib/catalog/samples.ts";

const REPO = path.resolve(import.meta.dir, "..", "..");
const fonts = FontManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(REPO, "catalog", "fonts.json"), "utf-8")));
const CYR = /\p{Script=Cyrillic}/u;

function fragmentSources() {
  const out: Array<{ where: string; text: string }> = [{ where: "harness", text: HARNESS_CSS }];
  for (const kind of fs.readdirSync(path.join(REPO, "catalog", "items"))) {
    for (const f of fs.readdirSync(path.join(REPO, "catalog", "items", kind))) {
      out.push({ where: `${kind}/${f}`, text: fs.readFileSync(path.join(REPO, "catalog", "items", kind, f), "utf-8") });
    }
  }
  return out;
}

/** Minimal TrueType buffer: a table directory with one `cmap` (format 4) mapping the given code-point ranges. */
function syntheticTtf(ranges: Array<[number, number]>): Buffer {
  const segs = [...ranges, [0xffff, 0xffff] as [number, number]];
  const n = segs.length;
  const sub = Buffer.alloc(16 + n * 8);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(sub.length, 2);
  sub.writeUInt16BE(n * 2, 6);
  let glyph = 1;
  segs.forEach(([a, b], i) => {
    sub.writeUInt16BE(b, 14 + i * 2);
    sub.writeUInt16BE(a, 16 + n * 2 + i * 2);
    const delta = a === 0xffff ? 1 : (glyph - a) & 0xffff;
    sub.writeUInt16BE(delta, 16 + n * 4 + i * 2);
    sub.writeUInt16BE(0, 16 + n * 6 + i * 2);
    if (a !== 0xffff) glyph += b - a + 1;
  });
  const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12]), sub]);
  const head = Buffer.alloc(12 + 16);
  head.writeUInt32BE(0x00010000, 0);
  head.writeUInt16BE(1, 4);
  head.write("cmap", 12, "latin1");
  head.writeUInt32BE(28, 20);
  head.writeUInt32BE(cmap.length, 24);
  return Buffer.concat([head, cmap]);
}

describe("font manifest (#565)", () => {
  test("every font is free for commercial video, pinned and measured", () => {
    expect(fonts.fonts.length).toBeGreaterThanOrEqual(20);
    for (const f of fonts.fonts) {
      expect(ALLOWED_FONT_LICENSES).toContain(f.license.id);
      expect(f.license.commercialVideo).toBe(true);
      expect(f.license.sha256).toMatch(/^[0-9a-f]{64}$/);
      for (const file of f.files) {
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(file.bytes).toBeGreaterThan(1000);
        expect(file.weight).toMatch(/^\d{3,4}( \d{3,4})?$/);
      }
      expect(f.coverage!.tags).toContain("latin");
    }
    expect(fonts.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(rawSourceUrl(fonts.source.commit, "ofl/inter/Inter[opsz,wght].ttf")).toContain("Inter%5Bopsz%2Cwght%5D.ttf");
  });

  test("10 pairs by register; both faces of every pair cover Latin and Cyrillic", () => {
    expect(fonts.pairs.length).toBe(10);
    const registers = fonts.pairs.map((p) => p.register);
    for (const r of ["bold creator", "editorial", "tech", "playful", "luxury", "horror"]) expect(registers).toContain(r);
    const byId = new Map(fonts.fonts.map((f) => [f.id, f]));
    for (const p of fonts.pairs) {
      for (const role of [p.display, p.body]) {
        const tags = byId.get(role.font)!.coverage!.tags;
        expect(tags).toContain("latin");
        expect(tags).toContain("cyrillic");
      }
    }
  });

  test("Latin-only fonts are tagged as such (automatic coverage, not hand-written)", () => {
    const anton = fonts.fonts.find((f) => f.id === "anton")!;
    expect(anton.coverage!.tags).not.toContain("cyrillic");
    expect(anton.coverage!.missing.cyrillic!.length).toBeGreaterThan(0);
  });
});

describe("OpenType coverage parser (#565)", () => {
  test("format 4 cmap: Latin letters present, Cyrillic missing", () => {
    const buf = syntheticTtf([
      [0x20, 0x7e],
      [0xc0, 0x17f],
    ]);
    const f = parseFont(buf);
    expect(f.has(0x41)).toBe(true);
    expect(f.has(0x410)).toBe(false);
    const cov = coverageFor(f);
    expect(cov.tags).toEqual(["latin", "latin-ext"]);
    expect(cov.missing.cyrillic!.length).toBeGreaterThan(0);
  });

  test("adding the Cyrillic block flips the tag", () => {
    const f = parseFont(syntheticTtf([[0x20, 0x7e], [0x400, 0x4ff]]));
    expect(coverageFor(f).tags).toContain("cyrillic");
    expect(coverageFor(f).tags).toContain("cyrillic-ext");
    expect(COVERAGE_SETS.cyrillic.length).toBe(66);
  });

  test("compressed woff2 is refused with a clear message", () => {
    expect(() => parseFont(Buffer.from("wOF2" + "\0".repeat(64), "latin1"))).toThrow(/compressed/);
  });
});

describe("unlicensed-font lint (#565)", () => {
  test("the shipped catalog has no unlicensed font", () => {
    const errors = lintFontManifest(fonts, fragmentSources()).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  test("an unknown primary family fails; a system fallback after a licensed family passes", () => {
    const issues = lintFontManifest(fonts, [
      { where: "a.html", text: `.x { font-family: "Helvetica Neue Pro", sans-serif; }` },
      { where: "b.html", text: `.y { font-family: "Anton", "Impact", sans-serif; }` },
      { where: "c.html", text: `.z { font-family: Impact, sans-serif; }` },
    ]);
    expect(issues.filter((i) => i.code === "font.unlicensed").map((i) => i.where)).toEqual(["a.html", "c.html"]);
  });

  test("a font without a pinned license or file hash fails", () => {
    const broken = structuredClone(fonts);
    broken.fonts[0]!.license.sha256 = null;
    broken.fonts[1]!.files[0]!.sha256 = null;
    const codes = lintFontManifest(broken, []).map((i) => i.code);
    expect(codes).toContain("font.license-unpinned");
    expect(codes).toContain("font.file-unpinned");
  });

  test("the schema refuses a license outside OFL / Apache", () => {
    const bad = structuredClone(JSON.parse(fs.readFileSync(path.join(REPO, "catalog", "fonts.json"), "utf-8")));
    bad.fonts[0].license.id = "Proprietary";
    expect(FontManifestSchema.safeParse(bad).success).toBe(false);
  });

  test("font-family declarations parse primary and fallbacks", () => {
    expect(fontFamilyDeclarations(`a { font-family: "Space Grotesk", sans-serif; } b{font-family:Inter}`)).toEqual([
      ["Space Grotesk", "sans-serif"],
      ["Inter"],
    ]);
  });
});

describe("font wiring and samples (#565)", () => {
  test("vendored faces are declared only for families the page uses and files present", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-fonts-"));
    try {
      fs.mkdirSync(path.join(dir, "inter"));
      fs.writeFileSync(path.join(dir, "inter", "inter.ttf"), "x");
      const r = await fontFacesForHtml(`.a { font-family: "Inter", sans-serif } .b { font-family: "Anton" }`, fonts, dir);
      expect(r.faces.map((f) => f.family)).toEqual(["Inter"]);
      expect(r.faces[0]!.file).toBe("fonts/inter.ttf");
      expect(r.faces[0]!.format).toBe("truetype");
      expect(r.missing).toEqual(["anton/anton.ttf"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Russian samples decode to Cyrillic while the source stays ASCII", () => {
    expect(CYR.test(CAPTION_SAMPLE.ru)).toBe(true);
    expect(CYR.test(FONT_PAIR_SAMPLE.ru.headline)).toBe(true);
    expect(CYR.test(CAPTION_SAMPLE.en)).toBe(false);
    const src = fs.readFileSync(path.join(REPO, "cli", "lib", "catalog", "samples.ts"), "utf-8");
    expect(CYR.test(src)).toBe(false);
    const words = captionSampleWords(0.3);
    expect(words[0]!.lang).toBe("en");
    expect(words[words.length - 1]!.lang).toBe("ru");
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeGreaterThan(words[i - 1]!.end);
  });

  test("a font-pair specimen shows English then Russian with the pair's families", () => {
    const pair = fonts.pairs.find((p) => p.id === "bold-creator")!;
    const html = buildFontPairHtml(pair, fonts, [{ family: "Montserrat", file: "fonts/montserrat.ttf", weight: "100 900", style: "normal", format: "truetype" }]);
    expect(html).toContain('font-family: "Montserrat"');
    expect(html).toContain('font-family: "Inter"');
    expect(html).toContain('src: url("fonts/montserrat.ttf") format("truetype")');
    expect(html.indexOf('id="fp-en"')).toBeLessThan(html.indexOf('id="fp-ru"'));
    expect(CYR.test(html)).toBe(true);
  });
});
