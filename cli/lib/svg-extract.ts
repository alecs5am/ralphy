// SVG layer structure extractor (#049).
//
// Parses an SVG file as plain text and reports the bits an agent needs to
// avoid the twitch-fb-ads-001 "missed white-interior polygon" bug:
//   - Top-level <g> / <path> / <polygon> / <rect> / <ellipse> / <circle>
//   - fill / fill-rule / fill-opacity on each shape
//   - compound paths (any path-data string containing `M` more than once,
//     i.e. multiple subpaths — fill-rule="evenodd" is load-bearing here)
//   - overlay rects covering large fractions of the viewBox (false positives
//     for "background" shapes that occlude an interior)
//
// Pure parser — no DOM, no fetch. Output is JSON. CLI surface is
// `ralphy brand extract <svg>`.

import fs from "node:fs/promises";

export type SvgShape = {
  tag: "path" | "polygon" | "rect" | "ellipse" | "circle" | "g";
  /** 1-indexed shape order within the file (top-level traversal). */
  index: number;
  fill: string | null;
  fillRule: string | null;
  fillOpacity: number | null;
  /** Raw `d="…"` value (paths only). */
  d?: string;
  /** Number of `M`/`m` subpath starts in `d`. >1 = compound path. */
  subpathCount?: number;
  /** Heuristic: true if this rect covers ≥ 80% of viewBox area. */
  isOverlayRect?: boolean;
  /** Raw element text (attribute-only — children stripped). */
  raw: string;
};

export type SvgReport = {
  path: string;
  viewBox: { x: number; y: number; w: number; h: number } | null;
  width: string | null;
  height: string | null;
  shapeCount: number;
  compoundPathCount: number;
  overlayRectCount: number;
  shapes: SvgShape[];
  /** Human-readable issues to surface to the agent. */
  warnings: string[];
};

function attr(raw: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = raw.match(re);
  return m ? m[1]! : null;
}

function parseViewBox(s: string | null): SvgReport["viewBox"] {
  if (!s) return null;
  const parts = s.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
}

/**
 * Top-level structural parse. Heuristic, not a full XML parser — purpose is
 * agent-facing diagnostics, not round-trip fidelity. Single-pass regex sweep
 * over each shape tag. Anything inside <defs>...</defs> is skipped (defs are
 * referenced shapes, not rendered layers).
 */
export function extractSvgStructure(svgPath: string, text: string): SvgReport {
  // Strip defs blocks (regex is non-greedy on purpose).
  const defStripped = text.replace(/<defs[\s\S]*?<\/defs>/gi, "");
  const viewBoxRaw = attr(text, "viewBox");
  const viewBox = parseViewBox(viewBoxRaw);
  const width = attr(text, "width");
  const height = attr(text, "height");

  const shapes: SvgShape[] = [];
  let index = 0;
  // Match self-closing OR open/close shape tags. We only need the attribute
  // string so the children can be ignored — the per-shape attrs (fill etc.)
  // are what we report.
  const tagRe =
    /<(path|polygon|rect|ellipse|circle|g)\b([^>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(defStripped)) !== null) {
    const tag = m[1]!.toLowerCase() as SvgShape["tag"];
    const rawAttrs = `<${tag} ${m[2]}/>`;
    index += 1;
    const fill = attr(rawAttrs, "fill");
    const fillRule = attr(rawAttrs, "fill-rule");
    const fillOpacityRaw = attr(rawAttrs, "fill-opacity");
    const fillOpacity = fillOpacityRaw == null ? null : Number(fillOpacityRaw);
    const shape: SvgShape = {
      tag,
      index,
      fill,
      fillRule,
      fillOpacity: Number.isFinite(fillOpacity ?? NaN) ? (fillOpacity as number) : null,
      raw: rawAttrs,
    };
    if (tag === "path") {
      const d = attr(rawAttrs, "d") ?? "";
      shape.d = d;
      // Count subpath starts (M or m). Multiple subpaths + fill-rule=evenodd
      // is the canonical "compound path with knockout interior" shape that
      // tripped twitch-fb-ads-001.
      const matches = d.match(/[Mm]/g);
      shape.subpathCount = matches ? matches.length : 0;
    } else if (tag === "rect" && viewBox) {
      const w = Number(attr(rawAttrs, "width") ?? 0);
      const h = Number(attr(rawAttrs, "height") ?? 0);
      if (Number.isFinite(w) && Number.isFinite(h) && viewBox.w > 0 && viewBox.h > 0) {
        const coverage = (w * h) / (viewBox.w * viewBox.h);
        shape.isOverlayRect = coverage >= 0.8;
      }
    }
    shapes.push(shape);
  }

  const compoundPathCount = shapes.filter(
    (s) => s.tag === "path" && (s.subpathCount ?? 0) > 1,
  ).length;
  const overlayRectCount = shapes.filter((s) => s.isOverlayRect === true).length;

  const warnings: string[] = [];
  for (const s of shapes) {
    if (s.tag === "path" && (s.subpathCount ?? 0) > 1 && s.fillRule == null) {
      warnings.push(
        `shape ${s.index} (path): compound path with ${s.subpathCount} subpaths but no fill-rule set — ` +
          `interior polygons may render as solid. Set fill-rule="evenodd" if you need the knockout.`,
      );
    }
    if (s.tag === "path" && s.fill == null && (s.subpathCount ?? 0) > 1) {
      warnings.push(
        `shape ${s.index} (path): compound path with no fill attribute — agent may miss the interior.`,
      );
    }
  }
  if (overlayRectCount > 0) {
    warnings.push(
      `${overlayRectCount} rect(s) cover ≥80% of viewBox — likely background overlays that occlude interiors.`,
    );
  }

  return {
    path: svgPath,
    viewBox,
    width,
    height,
    shapeCount: shapes.length,
    compoundPathCount,
    overlayRectCount,
    shapes,
    warnings,
  };
}

export async function extractSvgFile(svgPath: string): Promise<SvgReport> {
  const text = await fs.readFile(svgPath, "utf8");
  return extractSvgStructure(svgPath, text);
}
