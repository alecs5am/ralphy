// #564 — platform UI safe zones as data, the zone checker behind
// `ralphy editor lint-safe-zones`, and the vertical layouts' slot geometry.
// Pure / offline: the headless probe is covered by the integration test.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CatalogManifestSchema } from "../../cli/lib/catalog/schema.ts";
import { parseFragment } from "../../cli/lib/catalog/harness.ts";
import {
  checkSafeZones,
  insideSafeBox,
  isOffCanvas,
  PLATFORM_SAFE_ZONES,
  SAFE_ZONE_FRAME,
  SAFE_ZONE_PLATFORMS,
  sampleTimes,
  type ProbeSample,
} from "../../cli/lib/editor/safe-zones.ts";

const REPO = path.resolve(import.meta.dir, "..", "..");
const manifest = CatalogManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(REPO, "catalog", "manifest.json"), "utf-8")));
const layouts = manifest.items.filter((i) => i.kind === "layout");

describe("platform safe-zone data (#564)", () => {
  test("safe boxes match the per-platform table in docs/green-zone.md", () => {
    const box = (p: (typeof SAFE_ZONE_PLATFORMS)[number]) => {
      const s = PLATFORM_SAFE_ZONES[p].safe;
      return [s.left, s.left + s.width, s.top, s.top + s.height];
    };
    expect(box("tiktok")).toEqual([60, 960, 220, 1500]);
    expect(box("reels")).toEqual([60, 960, 200, 1450]);
    expect(box("shorts")).toEqual([80, 980, 180, 1520]);
    const doc = fs.readFileSync(path.join(REPO, "docs", "green-zone.md"), "utf-8");
    expect(doc).toContain("| TikTok | 60 | 960 | 220 | 1500 |");
    expect(doc).toContain("| Instagram Reels | 60 | 960 | 200 | 1450 |");
    expect(doc).toContain("| YouTube Shorts | 80 | 980 | 180 | 1520 |");
  });

  test("zones tile the frame around the safe box without overlapping it", () => {
    for (const p of SAFE_ZONE_PLATFORMS) {
      const { safe, zones } = PLATFORM_SAFE_ZONES[p];
      const area = zones.reduce((n, z) => n + z.rect.width * z.rect.height, 0) + safe.width * safe.height;
      // Top, rail, bottom and left edge plus the safe box cover the frame except the strip right of the rail's x.
      expect(area).toBeLessThanOrEqual(SAFE_ZONE_FRAME.width * SAFE_ZONE_FRAME.height);
      for (const z of zones) expect(insideSafeBox(z.rect, p)).toBe(false);
      expect(zones.filter((z) => z.kind === "ui").map((z) => z.id)).toEqual(["top-bar", "right-rail", "bottom-block"]);
    }
  });
});

describe("checkSafeZones (#564)", () => {
  const caption = { selector: "#cap", role: "caption" as const, text: "Buy now", rect: { left: 120, top: 1600, width: 700, height: 90 } };
  const goodText = { selector: "#hook", role: "text" as const, text: "Hook", rect: { left: 100, top: 300, width: 800, height: 120 } };

  test("a caption under the bottom block is an error on every platform; safe text passes", () => {
    const findings = checkSafeZones([{ t: 1, elements: [caption, goodText] }]);
    expect(findings.map((f) => f.platform).sort()).toEqual(["reels", "shorts", "tiktok"]);
    expect(findings.every((f) => f.severity === "error" && f.zone === "bottom-block" && f.selector === "#cap")).toBe(true);
    expect(findings[0]!.fix).toContain("Keep its bottom above");
  });

  test("platform filter, tolerance and off-canvas parking", () => {
    const tiktokOnly = checkSafeZones([{ t: 1, elements: [caption] }], { platforms: ["tiktok"] });
    expect(tiktokOnly.length).toBe(1);
    // Reels bottom block starts at 1450: a 1448-1460 box intrudes 10 px (> 4 px default tolerance).
    const graze = { ...goodText, rect: { left: 100, top: 1400, width: 700, height: 60 } };
    expect(checkSafeZones([{ t: 0, elements: [graze] }], { platforms: ["reels"] }).length).toBe(1);
    expect(checkSafeZones([{ t: 0, elements: [graze] }], { platforms: ["reels"], tolerance: 12 }).length).toBe(0);
    const parked = { ...caption, rect: { left: 1200, top: 1600, width: 300, height: 90 } };
    expect(isOffCanvas(parked.rect)).toBe(true);
    expect(checkSafeZones([{ t: 0, elements: [parked] }]).length).toBe(0);
  });

  test("faces and products are graded by the share under the UI", () => {
    const face = (left: number) => ({ selector: "#face", role: "face" as const, text: null, rect: { left, top: 600, width: 300, height: 380 } });
    expect(checkSafeZones([{ t: 0, elements: [face(640)] }], { platforms: ["tiktok"] })).toEqual([]);
    const partly = checkSafeZones([{ t: 0, elements: [face(680)] }], { platforms: ["tiktok"] });
    expect(partly[0]!.severity).toBe("warning");
    const mostly = checkSafeZones([{ t: 0, elements: [face(900)] }], { platforms: ["tiktok"] });
    expect(mostly[0]!.severity).toBe("error");
  });

  test("findings collapse across samples with first / last seen and the worst overlap", () => {
    const samples: ProbeSample[] = [0.5, 1, 1.5].map((t, i) => ({ t, elements: [{ ...caption, rect: { ...caption.rect, top: 1500 + i * 40 } }] }));
    const f = checkSafeZones(samples, { platforms: ["reels"] });
    expect(f.length).toBe(1);
    expect(f[0]!.occurrences).toBe(3);
    expect(f[0]!.firstSeen).toBe(0.5);
    expect(f[0]!.lastSeen).toBe(1.5);
    expect(f[0]!.overlap.px).toBe(90);
  });

  test("edge margin is a warning, not an error", () => {
    const edge = { ...goodText, rect: { left: 20, top: 400, width: 500, height: 80 } };
    const f = checkSafeZones([{ t: 0, elements: [edge] }], { platforms: ["shorts"] });
    expect(f.length).toBe(1);
    expect(f[0]!.zone).toBe("left-edge");
    expect(f[0]!.severity).toBe("warning");
  });

  test("sample times are evenly spaced midpoints", () => {
    expect(sampleTimes(4, 4)).toEqual([0.5, 1.5, 2.5, 3.5]);
  });
});

describe("vertical layouts (#564)", () => {
  test("8 layouts cover the agreed set", () => {
    expect(layouts.map((l) => l.id).sort()).toEqual(
      [
        "layout-broll-caption-band",
        "layout-gameplay-split",
        "layout-keyed-talking-head",
        "layout-pip",
        "layout-reaction",
        "layout-screen-facecam",
        "layout-split-top-bottom",
        "layout-text-led",
      ].sort(),
    );
  });

  test("text, caption, CTA and face slots sit inside every platform's safe box", () => {
    for (const l of layouts) {
      for (const s of l.slots!) {
        if (!["text", "caption", "cta", "face"].includes(s.role)) continue;
        const [left, top, width, height] = s.box;
        for (const p of SAFE_ZONE_PLATFORMS) {
          const inside = insideSafeBox({ left, top, width, height }, p, p === "shorts" ? 20 : 0);
          if (!inside) throw new Error(`${l.id}/${s.id} (${s.role}) leaves the ${p} safe box: ${s.box.join(",")}`);
        }
      }
    }
  });

  test("every slot is inside the 1080x1920 frame and tagged in the fragment", () => {
    for (const l of layouts) {
      const parts = parseFragment(fs.readFileSync(path.join(REPO, "catalog", l.source), "utf-8"));
      for (const s of l.slots!) {
        const [left, top, width, height] = s.box;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(1080);
        expect(top + height).toBeLessThanOrEqual(1920);
        if (s.role !== "face") expect(parts.markup).toContain(`data-slot="${s.id}"`);
      }
      // Captions and faces carry data-safe-zone so the lint checks them even when their text is empty.
      if (l.slots!.some((s) => s.role === "caption")) expect(parts.markup).toContain('data-safe-zone="caption"');
    }
  });

  test("the keyed talking head expects an alpha cutout (#560)", () => {
    const l = layouts.find((i) => i.id === "layout-keyed-talking-head")!;
    expect(l.slots!.find((s) => s.id === "subject")!.keyed).toBe(true);
  });
});
