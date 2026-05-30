// Unit tests for the SVG layer-structure extractor added in issue #049.
// Pure parser — no fs access.

import { describe, test, expect } from "bun:test";
import { extractSvgStructure } from "../../cli/lib/svg-extract.js";

describe("extractSvgStructure — twitch-fb-ads-001 prevention (#049)", () => {
  test("parses viewBox + width + height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="200" height="100">
      <rect width="10" height="10" fill="#fff"/>
    </svg>`;
    const r = extractSvgStructure("logo.svg", svg);
    expect(r.viewBox).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(r.width).toBe("200");
    expect(r.height).toBe("100");
    expect(r.shapeCount).toBe(1);
  });

  test("compound path (multiple M) is flagged with subpathCount > 1", () => {
    // Two subpaths: outer ring + inner knockout. The twitch-fb-ads-001 trap.
    const svg = `<svg viewBox="0 0 100 100">
      <path d="M10 10 L90 10 L90 90 L10 90 Z M30 30 L70 30 L70 70 L30 70 Z" fill="#000"/>
    </svg>`;
    const r = extractSvgStructure("twitch.svg", svg);
    expect(r.shapeCount).toBe(1);
    expect(r.compoundPathCount).toBe(1);
    const p = r.shapes[0]!;
    expect(p.tag).toBe("path");
    expect(p.subpathCount).toBe(2);
    // No fill-rule → warning surfaces.
    expect(r.warnings.some((w) => w.includes("compound path"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("fill-rule"))).toBe(true);
  });

  test("compound path WITH fill-rule=evenodd → no missing-rule warning", () => {
    const svg = `<svg viewBox="0 0 100 100">
      <path d="M10 10 L90 10 L90 90 L10 90 Z M30 30 L70 30 L70 70 L30 70 Z" fill="#000" fill-rule="evenodd"/>
    </svg>`;
    const r = extractSvgStructure("twitch-evenodd.svg", svg);
    expect(r.compoundPathCount).toBe(1);
    expect(r.shapes[0]!.fillRule).toBe("evenodd");
    expect(r.warnings.some((w) => w.includes("fill-rule"))).toBe(false);
  });

  test("rect covering ≥80% of viewBox is flagged as overlay", () => {
    const svg = `<svg viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#fff"/>
      <path d="M10 10 L90 90" fill="#000"/>
    </svg>`;
    const r = extractSvgStructure("overlay.svg", svg);
    expect(r.overlayRectCount).toBe(1);
    expect(r.warnings.some((w) => w.includes("cover ≥80%"))).toBe(true);
  });

  test("small rect is not flagged as overlay", () => {
    const svg = `<svg viewBox="0 0 100 100">
      <rect width="10" height="10" fill="#fff"/>
    </svg>`;
    const r = extractSvgStructure("small.svg", svg);
    expect(r.overlayRectCount).toBe(0);
  });

  test("<defs> shapes are skipped (not part of rendered layers)", () => {
    const svg = `<svg viewBox="0 0 10 10">
      <defs>
        <path id="hidden" d="M0 0 L10 10"/>
      </defs>
      <rect width="10" height="10"/>
    </svg>`;
    const r = extractSvgStructure("defs.svg", svg);
    expect(r.shapeCount).toBe(1);
    expect(r.shapes[0]!.tag).toBe("rect");
  });

  test("captures fill / fill-opacity attrs verbatim", () => {
    const svg = `<svg viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="3" fill="#ff0000" fill-opacity="0.5"/>
    </svg>`;
    const r = extractSvgStructure("c.svg", svg);
    const s = r.shapes[0]!;
    expect(s.fill).toBe("#ff0000");
    expect(s.fillOpacity).toBe(0.5);
  });
});
