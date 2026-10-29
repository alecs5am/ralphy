// #565 — caption presets: the 12 catalog items of kind `caption`, their
// readability metadata, colour contrast, fonts, and the limits the caption
// gate (#441) takes from a preset.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CatalogManifestSchema } from "../../cli/lib/catalog/schema.ts";
import { FontManifestSchema } from "../../cli/lib/catalog/fonts.ts";
import { buildPreviewHtml } from "../../cli/lib/catalog/harness.ts";
import { captionContrast, captionLimitsFromPreset, contrastRatio } from "../../cli/lib/catalog/captions.ts";
import { checkCaptions } from "../../cli/lib/eval/captions-gate.ts";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";

const REPO = path.resolve(import.meta.dir, "..", "..");
const manifest = CatalogManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(REPO, "catalog", "manifest.json"), "utf-8")));
const fonts = FontManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(REPO, "catalog", "fonts.json"), "utf-8")));
const presets = manifest.items.filter((i) => i.kind === "caption");

describe("caption presets (#565)", () => {
  test("12 presets spanning 1 / 3 / 5 words per screen, pop and slide entries, active-word highlight, stroke and shadow", () => {
    expect(presets.length).toBe(12);
    const wps = new Set(presets.map((p) => p.caption!.wordsPerScreen));
    expect([...wps].sort()).toEqual([1, 3, 5]);
    const entries = new Set(presets.map((p) => p.caption!.entry));
    expect(entries.has("pop")).toBe(true);
    expect(entries.has("slide")).toBe(true);
    expect(presets.some((p) => p.caption!.highlight === "color")).toBe(true);
    expect(presets.some((p) => p.caption!.highlight === "box")).toBe(true);
    expect(presets.some((p) => p.caption!.stroke > 0)).toBe(true);
    expect(presets.some((p) => p.caption!.shadow)).toBe(true);
  });

  test("every colour scheme passes the contrast check", () => {
    for (const p of presets) {
      const c = captionContrast(p.caption!);
      if (!c.ok) throw new Error(`${p.id}: ${c.problems.join("; ")}`);
    }
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(captionContrast({ ...presets[0]!.caption!, colors: { text: "#777777", highlight: "#888888", background: "#666666" } }).ok).toBe(false);
  });

  test("every preset font is licensed and covers Latin and Cyrillic, and the fragment names that family", () => {
    for (const p of presets) {
      const font = fonts.fonts.find((f) => f.id === p.caption!.font);
      expect(font).toBeDefined();
      expect(font!.coverage!.tags).toEqual(expect.arrayContaining(["latin", "cyrillic"]));
      const frag = fs.readFileSync(path.join(REPO, "catalog", p.source), "utf-8");
      expect(frag).toContain(`font-family: "${font!.family}"`);
      expect(frag).toContain('data-safe-zone="caption"');
    }
  });

  test("the preview feeds English then Russian word timings and stays deterministic", () => {
    for (const p of presets) {
      const html = buildPreviewHtml({ item: p, fragmentHtml: fs.readFileSync(path.join(REPO, "catalog", p.source), "utf-8"), sfxFile: null });
      expect(html).toContain("words: [");
      expect(html).not.toContain("Math.random");
      expect(html).not.toContain("Date.now");
      expect(/\p{Script=Cyrillic}/u.test(html)).toBe(true);
    }
  });

  test("gate limits follow the preset's words per screen and on-screen floor", () => {
    const one = presets.find((p) => p.caption!.wordsPerScreen === 1)!;
    const five = presets.find((p) => p.caption!.wordsPerScreen === 5)!;
    const l1 = captionLimitsFromPreset(one.id, one.caption!);
    expect(l1.overcrowdedWarnWords).toBe(1);
    expect(l1.overcrowdedFailWords).toBe(3);
    expect(l1.tooShortWarnMs).toBe(one.caption!.minOnScreenMs);
    expect(l1.source).toBe(`preset:${one.id}`);
    expect(captionLimitsFromPreset(five.id, five.caption!).overcrowdedFailWords).toBe(11);
  });
});

describe("caption gate with a preset (#565)", () => {
  let tmp: TmpRoot;
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-cap-preset");
  });
  afterEach(() => tmp.cleanup());

  const track = [
    { text: "most videos lose", startMs: 0, endMs: 900, timestampMs: 450, confidence: 0.99 },
    { text: "you in the", startMs: 900, endMs: 1800, timestampMs: 1350, confidence: 0.99 },
  ];

  test("a 3-word window is fine by default but crowded for a 1-word preset", async () => {
    const base = await checkCaptions({ projectId: "cap-001", mode: null, captions: track, noPlacement: true, videoPath: "none.mp4" });
    expect(base.findings.filter((f) => f.category === "captions.overcrowded")).toEqual([]);
    expect(base.limits!.source).toBe("default");
    const one = presets.find((p) => p.id === "cap-one-word-pop")!;
    const r = await checkCaptions({ projectId: "cap-001", mode: null, captions: track, noPlacement: true, videoPath: "none.mp4", limits: captionLimitsFromPreset(one.id, one.caption!) });
    const crowded = r.findings.filter((f) => f.category === "captions.overcrowded");
    expect(crowded.length).toBe(2);
    expect(crowded.every((f) => f.severity === "warn")).toBe(true);
    expect(r.limits!.source).toBe("preset:cap-one-word-pop");
  });
});
