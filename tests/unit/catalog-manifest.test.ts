// #563 — motion catalog: item manifest schema, fragment contract, preview
// harness, SFX tagging + fingerprint dedupe helpers. Pure / offline.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CatalogManifestSchema, CatalogItemSchema, type CatalogItem } from "../../cli/lib/catalog/schema.ts";
import { defaultParams, filterCatalogItems } from "../../cli/lib/catalog/manifest.ts";
import { buildPreviewHtml, parseFragment, previewTiming } from "../../cli/lib/catalog/harness.ts";
import { envelopeFingerprint, fingerprintsMatch, isRawIntermediate, sfxId, tagForSfxName } from "../../cli/lib/catalog/sfx.ts";
import { renderCatalogPageHtml } from "../../cli/lib/catalog/page.ts";
import { lintHyperframesHtml } from "../../cli/lib/render/hyperframes-lint.ts";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CATALOG = path.join(REPO, "catalog");
const raw = JSON.parse(fs.readFileSync(path.join(CATALOG, "manifest.json"), "utf-8"));
const manifest = CatalogManifestSchema.parse(raw);

function baseItem(over: Partial<CatalogItem> = {}): Record<string, unknown> {
  return {
    id: "demo-item",
    kind: "transition",
    name: "Demo",
    summary: "Demo item.",
    source: "items/transition/demo-item.html",
    fn: "catalog_demo_item",
    duration: 0.4,
    cutAt: 0.2,
    energy: "high",
    moods: ["energetic"],
    tags: [],
    aspect: "9:16",
    params: [{ id: "duration", type: "number", label: "Duration", default: 0.4 }],
    whenToUse: "Always.",
    whenNotToUse: "Never.",
    sfx: { id: "sfx-whoosh-0123abcd", at: 0, volume: 0.8 },
    preview: "previews/demo-item.mp4",
    ledger: null,
    ...over,
  };
}

describe("catalog manifest (#563)", () => {
  test("parses and meets the checkpoint caps: 20 transitions, 15 elements, 8 layouts (#564), 12 caption presets (#565), 12 camera recipes (#567), all 9:16", () => {
    const transitions = manifest.items.filter((i) => i.kind === "transition");
    const elements = manifest.items.filter((i) => i.kind === "element");
    expect(transitions.length).toBe(20);
    expect(elements.length).toBe(15);
    expect(manifest.items.filter((i) => i.kind === "layout").length).toBe(8);
    expect(manifest.items.filter((i) => i.kind === "caption").length).toBe(12);
    expect(manifest.items.filter((i) => i.kind === "camera").length).toBe(12);
    expect(manifest.items.every((i) => i.aspect === "9:16")).toBe(true);
  });

  test("every item has a fragment that defines its function and uses its declared params", () => {
    for (const item of manifest.items) {
      const file = path.join(CATALOG, item.source);
      expect(fs.existsSync(file)).toBe(true);
      const parts = parseFragment(fs.readFileSync(file, "utf-8"));
      expect(parts.js).toContain(`function ${item.fn}(tl, o)`);
      for (const p of item.params) expect(parts.js).toContain(`o.${p.id}`);
    }
  });

  test("every item carries usage guidance and at least one mood; transitions and elements carry an SFX cue", () => {
    for (const item of manifest.items) {
      expect(item.whenToUse.length).toBeGreaterThan(10);
      expect(item.whenNotToUse.length).toBeGreaterThan(10);
      expect(item.moods.length).toBeGreaterThan(0);
      if (item.kind === "transition" || item.kind === "element") expect(item.sfx).not.toBeNull();
    }
  });

  test("duration param default mirrors the item duration when declared", () => {
    for (const item of manifest.items) {
      const d = item.params.find((p) => p.id === "duration");
      if (d) expect(d.default).toBe(item.duration);
    }
  });

  test("kind metadata is required: layouts need slots, captions need caption, cameras need camera", () => {
    const layout = baseItem({ kind: "layout", source: "items/layout/demo-item.html", cutAt: undefined, sfx: null });
    expect(CatalogManifestSchema.safeParse({ version: 1, updated: "2026-10-30", items: [layout] }).success).toBe(false);
    const camera = baseItem({ kind: "camera", source: "items/camera/demo-item.html", cutAt: undefined, sfx: null });
    expect(CatalogManifestSchema.safeParse({ version: 1, updated: "2026-10-30", items: [camera] }).success).toBe(false);
    expect(CatalogManifestSchema.safeParse({ version: 1, updated: "2026-10-30", items: [{ ...camera, camera: { input: "footage", overscan: 1 } }] }).success).toBe(true);
  });

  test("rejects duplicate ids, a transition without cutAt, a malformed sfx id, and a bad enum default", () => {
    const dup = { version: 1, updated: "2026-10-30", items: [baseItem(), baseItem()] };
    expect(CatalogManifestSchema.safeParse(dup).success).toBe(false);
    const noCut = { version: 1, updated: "2026-10-30", items: [baseItem({ cutAt: undefined })] };
    expect(CatalogManifestSchema.safeParse(noCut).success).toBe(false);
    expect(CatalogItemSchema.safeParse(baseItem({ sfx: { id: "whoosh.mp3", at: 0, volume: 1 } })).success).toBe(false);
    const badEnum = baseItem({
      params: [{ id: "direction", type: "enum", label: "Dir", default: "up", options: [{ value: "left", label: "left" }] }],
    });
    expect(CatalogItemSchema.safeParse(badEnum).success).toBe(false);
    const wrongPreview = { version: 1, updated: "2026-10-30", items: [baseItem({ preview: "previews/other.mp4" })] };
    expect(CatalogManifestSchema.safeParse(wrongPreview).success).toBe(false);
    expect(CatalogManifestSchema.safeParse({ version: 1, updated: "2026-10-30", items: [baseItem()] }).success).toBe(true);
  });

  test("filterCatalogItems ANDs kind, mood, energy, tag and sfx tag", () => {
    const energetic = filterCatalogItems(manifest.items, { kind: "transition", mood: "energetic" });
    expect(energetic.length).toBeGreaterThan(0);
    expect(energetic.every((i) => i.kind === "transition" && i.moods.includes("energetic"))).toBe(true);
    const calm = filterCatalogItems(manifest.items, { energy: "calm" });
    expect(calm.every((i) => i.energy === "calm")).toBe(true);
    const glitchSfx = filterCatalogItems(manifest.items, { sfx: "glitch" });
    expect(glitchSfx.every((i) => i.sfx!.id.startsWith("sfx-glitch-"))).toBe(true);
    expect(filterCatalogItems(manifest.items, { kind: "layout" }).length).toBe(8);
  });
});

describe("preview harness (#563)", () => {
  test("every item assembles into a lint-clean, parametrized 1080x1920 composition", () => {
    for (const item of manifest.items) {
      const html = buildPreviewHtml({ item, fragmentHtml: fs.readFileSync(path.join(CATALOG, item.source), "utf-8"), sfxFile: "sfx.mp3" });
      expect(html).toContain('data-width="1080" data-height="1920"');
      expect(html).toContain("data-composition-variables=");
      expect(html).toContain(`${item.fn}(tl, Object.assign(`);
      expect(html).toContain('window.__timelines["main"] = tl');
      expect(html).not.toContain("Math.random");
      expect(html).not.toContain("repeat: -1");
      if (item.sfx) expect(html).toContain('id="cat-sfx"');
      else expect(html).not.toContain("<audio");
      expect(lintHyperframesHtml(html).ok).toBe(true);
      const vars = JSON.parse(html.match(/data-composition-variables='([^']*)'/)![1]!.replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
      expect(vars.map((v: { id: string }) => v.id)).toEqual(item.params.map((p) => p.id));
      expect(Object.keys(defaultParams(item))).toEqual(item.params.map((p) => p.id));
    }
  });

  test("a silent build omits the audio element; a trimmed cue sets data-duration", () => {
    const item = manifest.items.find((i) => i.sfx?.trim)!;
    const frag = fs.readFileSync(path.join(CATALOG, item.source), "utf-8");
    expect(buildPreviewHtml({ item, fragmentHtml: frag, sfxFile: null })).not.toContain("<audio");
    expect(buildPreviewHtml({ item, fragmentHtml: frag, sfxFile: "sfx.mp3" })).toContain(`data-duration="${item.sfx!.trim}"`);
  });

  test("transitions swap at 1.1 s, elements enter at 0.4 s, totals leave a hold", () => {
    const t = manifest.items.find((i) => i.kind === "transition")!;
    const e = manifest.items.find((i) => i.kind === "element")!;
    expect(previewTiming(t).at).toBe(1.1);
    expect(previewTiming(e).at).toBe(0.4);
    expect(previewTiming(t).total).toBeGreaterThan(1.1 + t.duration);
  });

  test("a fragment missing its function is refused", () => {
    const item = manifest.items[0]!;
    expect(() => buildPreviewHtml({ item, fragmentHtml: "<script data-catalog-js>function other(tl, o) {}</script>", sfxFile: null })).toThrow();
  });

  test("catalog page lists every item and points at local previews", () => {
    const html = renderCatalogPageHtml(manifest, null, new Set(manifest.items.map((i) => i.id)));
    for (const item of manifest.items) expect(html).toContain(`"id":"${item.id}"`);
    expect(html).toContain('"preview":"previews/zoom-punch.mp4"');
    expect(html).toContain('data-facet="kind"');
    expect(html).toContain('data-facet="mood"');
    expect(html).toContain('data-facet="energy"');
  });
});

describe("SFX pack helpers (#563)", () => {
  test("keyword tagger maps motion-design names to their use", () => {
    expect(tagForSfxName("corporate-whoosh-v3.mp3")).toBe("whoosh");
    expect(tagForSfxName("v4-sfx-snap-zoom.mp3")).toBe("swoosh");
    expect(tagForSfxName("sfx-riser-reverse.mp3")).toBe("riser");
    expect(tagForSfxName("sfx-sub-impact.mp3")).toBe("impact");
    expect(tagForSfxName("sfx-tv-off.mp3")).toBe("glitch");
    expect(tagForSfxName("v4-sfx-selection-click.mp3")).toBe("click");
    expect(tagForSfxName("v4-sfx-selection-confirm.mp3")).toBe("pop");
    expect(tagForSfxName("heel-crush.mp3")).toBe("foley");
    expect(tagForSfxName("surprise-choice-02-sweet-ah.mp3")).toBe("vocal");
    expect(tagForSfxName("d-a04.mp3")).toBe("misc");
  });

  test("raw intermediates are skipped only when the processed sibling exists", () => {
    expect(isRawIntermediate("drip.raw.mp3", new Set(["drip.mp3", "drip.raw.mp3"]))).toBe(true);
    expect(isRawIntermediate("drip.raw.mp3", new Set(["drip.raw.mp3"]))).toBe(false);
    expect(isRawIntermediate("drip.mp3", new Set(["drip.mp3"]))).toBe(false);
  });

  test("fingerprint is gain-invariant and separates different sounds", () => {
    const rate = 8000;
    const tone = new Int16Array(rate);
    const hiss = new Int16Array(rate);
    let s = 1;
    for (let i = 0; i < rate; i++) {
      const env = Math.exp(-i / 2000);
      tone[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 12000 * env);
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      hiss[i] = Math.round(((s / 0x7fffffff) * 2 - 1) * 12000 * env);
    }
    const quiet = tone.map((v) => Math.round(v / 4)) as Int16Array;
    const a = envelopeFingerprint(tone, rate);
    expect(a.hex.length).toBe(64);
    expect(fingerprintsMatch(a, envelopeFingerprint(quiet, rate))).toBe(true);
    expect(fingerprintsMatch(a, envelopeFingerprint(hiss, rate))).toBe(false);
    expect(fingerprintsMatch(a, envelopeFingerprint(tone.slice(0, rate / 2), rate))).toBe(false);
  });

  test("sfx ids are stable per content hash", () => {
    const sha = "f5cf2b46" + "0".repeat(56);
    expect(sfxId("swoosh", sha)).toBe("sfx-swoosh-f5cf2b46");
  });
});
