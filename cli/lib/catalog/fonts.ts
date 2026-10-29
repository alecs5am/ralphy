// Free font library with a license manifest (#565).
//
//   catalog/fonts.json            repo-tracked: every font's license, source
//                                 (google/fonts at a pinned commit), per-file
//                                 sha256, automatic glyph coverage, and the
//                                 curated font pairs by register.
//   .ralphy/catalog/fonts/<id>/   gitignored: the downloaded binaries (TTF, full
//                                 glyph set, Latin and Cyrillic in one file).
//
// Why full TTFs from google/fonts instead of the Google Fonts CSS API: the
// pinned HyperFrames compiler (0.6.31) caches Google Fonts by weight and style
// only, so whichever unicode subset it fetches last overwrites the others (the
// cached Anton 400 was a 5 KB non-Latin subset and previews fell back to system
// fonts). A full file declared with @font-face in the composition makes the
// compiler skip its own fetch, and one file covers every script the font has.
//
// Coverage is read from each file's `cmap` table (formats 4 and 12), weights
// from `fvar` (variable fonts) or `OS/2` (static fonts). No dependencies.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { catalogDataDir, catalogSourceDir } from "./paths.js";
import type { FontFaceSpec } from "./harness.js";

export const ALLOWED_FONT_LICENSES = ["OFL-1.1", "Apache-2.0"] as const;
export type FontLicenseId = (typeof ALLOWED_FONT_LICENSES)[number];

/** Text that must appear in the downloaded license file for each license id. */
const LICENSE_MARKERS: Record<FontLicenseId, RegExp> = {
  "OFL-1.1": /SIL OPEN FONT LICENSE Version 1\.1/i,
  "Apache-2.0": /Apache License,?\s+Version 2\.0/i,
};

export const COVERAGE_TAGS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"] as const;
export type CoverageTag = (typeof COVERAGE_TAGS)[number];

/** Families a fragment may name AFTER a manifest font as a last-resort fallback. Never shipped, never primary. */
export const SYSTEM_FALLBACK_FAMILIES = new Set([
  "impact",
  "arial",
  "helvetica",
  "helvetica neue",
  "georgia",
  "times new roman",
  "courier new",
]);
const GENERIC_FAMILIES = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "emoji", "math", "-apple-system", "blinkmacsystemfont", "inherit", "initial"]);

const SHA = z.string().regex(/^[0-9a-f]{64}$/);

export const FontFileSchema = z.object({
  /** Path inside the source repository (google/fonts). */
  path: z.string().min(1),
  /** Local file name under .ralphy/catalog/fonts/<font id>/. */
  local: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(ttf|otf|woff2)$/),
  style: z.enum(["normal", "italic"]),
  /** CSS font-weight: "400" for a static face, "100 900" for a variable range (filled by sync). */
  weight: z.string().regex(/^\d{3,4}( \d{3,4})?$/).nullable(),
  sha256: SHA.nullable(),
  bytes: z.number().int().positive().nullable(),
});
export type FontFile = z.infer<typeof FontFileSchema>;

export const FontCoverageSchema = z.object({
  tags: z.array(z.enum(COVERAGE_TAGS)),
  /** Code points (hex) a script check found missing; empty when the tag is present. */
  missing: z.record(z.string(), z.array(z.string())),
  glyphs: z.number().int().nonnegative(),
});

export const FontEntrySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  family: z.string().min(1),
  designer: z.string().min(1),
  category: z.enum(["sans", "serif", "display", "mono", "handwriting"]),
  license: z.object({
    id: z.enum(ALLOWED_FONT_LICENSES),
    /** License file path inside the source repository. */
    path: z.string().min(1),
    sha256: SHA.nullable(),
    /** OFL and Apache both allow commercial use, embedding and rendered video; recorded per font so a review sees it. */
    commercialVideo: z.literal(true),
  }),
  files: z.array(FontFileSchema).min(1),
  coverage: FontCoverageSchema.nullable(),
  note: z.string().min(1),
});
export type FontEntry = z.infer<typeof FontEntrySchema>;

const PairRoleSchema = z.object({
  font: z.string().regex(/^[a-z][a-z0-9-]*$/),
  weight: z.number().int().min(100).max(900),
  transform: z.enum(["none", "uppercase"]).default("none"),
  tracking: z.number().min(-0.1).max(0.3).default(0),
});

export const FontPairSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  register: z.string().min(1),
  display: PairRoleSchema,
  body: PairRoleSchema,
  colors: z.object({ background: z.string().regex(/^#[0-9a-fA-F]{6}$/), ink: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  whenToUse: z.string().min(1),
  whenNotToUse: z.string().min(1),
});
export type FontPair = z.infer<typeof FontPairSchema>;

export const FontManifestSchema = z
  .object({
    version: z.literal(1),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.object({ repo: z.literal("google/fonts"), commit: z.string().regex(/^[0-9a-f]{40}$/) }),
    fonts: z.array(FontEntrySchema),
    pairs: z.array(FontPairSchema),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    const families = new Set<string>();
    for (const f of m.fonts) {
      if (ids.has(f.id)) ctx.addIssue({ code: "custom", message: `duplicate font id ${f.id}` });
      if (families.has(f.family.toLowerCase())) ctx.addIssue({ code: "custom", message: `duplicate family ${f.family}` });
      ids.add(f.id);
      families.add(f.family.toLowerCase());
    }
    const pairIds = new Set<string>();
    for (const p of m.pairs) {
      if (pairIds.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate pair id ${p.id}` });
      pairIds.add(p.id);
      for (const role of [p.display, p.body]) {
        if (!ids.has(role.font)) ctx.addIssue({ code: "custom", message: `pair ${p.id}: unknown font ${role.font}` });
      }
    }
  });
export type FontManifest = z.infer<typeof FontManifestSchema>;

export function fontManifestPath(): string {
  return path.join(catalogSourceDir(), "fonts.json");
}

export function fontsDataDir(): string {
  return path.join(catalogDataDir(), "fonts");
}

export async function loadFontManifest(p: string = fontManifestPath()): Promise<FontManifest> {
  return FontManifestSchema.parse(JSON.parse(await fs.readFile(p, "utf-8")));
}

export function rawSourceUrl(commit: string, repoPath: string): string {
  return `https://raw.githubusercontent.com/google/fonts/${commit}/${repoPath.split("/").map(encodeURIComponent).join("/")}`;
}

// ── OpenType parsing (cmap / fvar / OS/2) ────────────────────────────────────

export type ParsedFont = {
  /** Code point -> has a non-zero glyph. */
  has: (cp: number) => boolean;
  glyphCount: number;
  /** Variable `wght` axis range, or null for a static face. */
  weightRange: [number, number] | null;
  weightClass: number | null;
  italic: boolean;
};

function tableDirectory(buf: Buffer): Map<string, { offset: number; length: number }> {
  const tag = buf.toString("latin1", 0, 4);
  if (tag === "wOF2" || tag === "wOFF") throw new Error("woff/woff2 is compressed; coverage needs the TTF/OTF");
  const numTables = buf.readUInt16BE(4);
  const out = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    out.set(buf.toString("latin1", rec, rec + 4), { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) });
  }
  return out;
}

function cmapCodepoints(buf: Buffer, cmapOffset: number): Set<number> {
  const n = buf.readUInt16BE(cmapOffset + 2);
  const subtables: Array<{ platform: number; encoding: number; offset: number }> = [];
  for (let i = 0; i < n; i++) {
    const rec = cmapOffset + 4 + i * 8;
    subtables.push({ platform: buf.readUInt16BE(rec), encoding: buf.readUInt16BE(rec + 2), offset: cmapOffset + buf.readUInt32BE(rec + 4) });
  }
  const cps = new Set<number>();
  // Prefer full-repertoire format 12, else the BMP format 4 table.
  const ordered = [...subtables].sort((a, b) => buf.readUInt16BE(b.offset) - buf.readUInt16BE(a.offset));
  for (const st of ordered) {
    const format = buf.readUInt16BE(st.offset);
    if (format === 12) {
      const groups = buf.readUInt32BE(st.offset + 12);
      for (let g = 0; g < groups; g++) {
        const r = st.offset + 16 + g * 12;
        const start = buf.readUInt32BE(r);
        const end = buf.readUInt32BE(r + 4);
        const glyph = buf.readUInt32BE(r + 8);
        for (let c = start; c <= end && c <= 0x10ffff; c++) if (glyph + (c - start) !== 0) cps.add(c);
      }
      return cps;
    }
    if (format === 4) {
      const segX2 = buf.readUInt16BE(st.offset + 6);
      const seg = segX2 / 2;
      const endBase = st.offset + 14;
      const startBase = endBase + segX2 + 2;
      const deltaBase = startBase + segX2;
      const rangeBase = deltaBase + segX2;
      for (let i = 0; i < seg; i++) {
        const end = buf.readUInt16BE(endBase + i * 2);
        const start = buf.readUInt16BE(startBase + i * 2);
        const delta = buf.readInt16BE(deltaBase + i * 2);
        const rangeOffset = buf.readUInt16BE(rangeBase + i * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const addr = rangeBase + i * 2 + rangeOffset + (c - start) * 2;
            glyph = buf.readUInt16BE(addr);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) cps.add(c);
        }
      }
      return cps;
    }
  }
  return cps;
}

export function parseFont(buf: Buffer): ParsedFont {
  const tables = tableDirectory(buf);
  const cmap = tables.get("cmap");
  if (!cmap) throw new Error("font has no cmap table");
  const cps = cmapCodepoints(buf, cmap.offset);
  let weightRange: [number, number] | null = null;
  const fvar = tables.get("fvar");
  if (fvar) {
    const axesOffset = buf.readUInt16BE(fvar.offset + 4);
    const axisCount = buf.readUInt16BE(fvar.offset + 8);
    const axisSize = buf.readUInt16BE(fvar.offset + 10);
    for (let i = 0; i < axisCount; i++) {
      const a = fvar.offset + axesOffset + i * axisSize;
      if (buf.toString("latin1", a, a + 4) === "wght") {
        weightRange = [Math.round(buf.readInt32BE(a + 4) / 65536), Math.round(buf.readInt32BE(a + 12) / 65536)];
      }
    }
  }
  const os2 = tables.get("OS/2");
  const weightClass = os2 ? buf.readUInt16BE(os2.offset + 4) : null;
  const italic = os2 ? (buf.readUInt16BE(os2.offset + 62) & 1) === 1 : false;
  const maxp = tables.get("maxp");
  const glyphCount = maxp ? buf.readUInt16BE(maxp.offset + 4) : cps.size;
  return { has: (cp) => cps.has(cp), glyphCount, weightRange, weightClass, italic };
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let c = a; c <= b; c++) out.push(c);
  return out;
}

/** Code points each coverage tag requires (all must be present). */
export const COVERAGE_SETS: Record<CoverageTag, number[]> = {
  latin: [...range(0x41, 0x5a), ...range(0x61, 0x7a), ...range(0x30, 0x39), ...[0x2e, 0x2c, 0x21, 0x3f, 0x27, 0x22, 0x2d, 0x3a, 0x3b, 0x28, 0x29, 0x26]],
  // Western and Central European letters most captions meet (French, German, Spanish, Portuguese, Polish, Czech, Turkish basics).
  "latin-ext": [0xc0, 0xc1, 0xc2, 0xc4, 0xc7, 0xc8, 0xc9, 0xca, 0xcd, 0xd1, 0xd3, 0xd6, 0xda, 0xdc, 0xdf, 0xe0, 0xe1, 0xe2, 0xe4, 0xe7, 0xe8, 0xe9, 0xea, 0xed, 0xf1, 0xf3, 0xf6, 0xfa, 0xfc, 0x104, 0x105, 0x106, 0x107, 0x118, 0x119, 0x141, 0x142, 0x143, 0x144, 0x15a, 0x15b, 0x160, 0x161, 0x17b, 0x17c, 0x17d, 0x17e, 0x11e, 0x11f, 0x130, 0x131, 0x15e, 0x15f],
  // Russian alphabet: U+0410..U+044F plus IO (U+0401, U+0451).
  cyrillic: [...range(0x410, 0x44f), 0x401, 0x451],
  // Ukrainian, Belarusian, Serbian / Macedonian letters.
  "cyrillic-ext": [0x404, 0x454, 0x406, 0x456, 0x407, 0x457, 0x490, 0x491, 0x40e, 0x45e, 0x408, 0x458, 0x409, 0x459, 0x40a, 0x45a, 0x40b, 0x45b, 0x40f, 0x45f],
};

export function coverageFor(font: Pick<ParsedFont, "has" | "glyphCount">): z.infer<typeof FontCoverageSchema> {
  const tags: CoverageTag[] = [];
  const missing: Record<string, string[]> = {};
  for (const tag of COVERAGE_TAGS) {
    const miss = COVERAGE_SETS[tag].filter((cp) => !font.has(cp));
    if (miss.length === 0) tags.push(tag);
    else missing[tag] = miss.slice(0, 12).map((cp) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0"));
  }
  return { tags, missing, glyphs: font.glyphCount };
}

/** Coverage of a whole font = the intersection across its files (a script counts only when every face has it). */
export function mergeCoverage(parts: Array<z.infer<typeof FontCoverageSchema>>): z.infer<typeof FontCoverageSchema> {
  const tags = COVERAGE_TAGS.filter((t) => parts.every((p) => p.tags.includes(t)));
  const missing: Record<string, string[]> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.missing)) missing[k] = [...new Set([...(missing[k] ?? []), ...v])].slice(0, 12);
  return { tags, missing, glyphs: Math.max(...parts.map((p) => p.glyphs)) };
}

// ── Sync: download, pin, verify license, measure coverage ────────────────────

export type FontSyncRow = { id: string; files: number; downloaded: number; verified: number; license: "verified" | "missing-marker" | "skipped"; tags: CoverageTag[]; error: string | null };

export async function syncFonts(manifest: FontManifest, opts: { ids?: string[]; fetchImpl?: typeof fetch; dataDir?: string } = {}): Promise<{ manifest: FontManifest; rows: FontSyncRow[] }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const root = opts.dataDir ?? fontsDataDir();
  const rows: FontSyncRow[] = [];
  const fonts: FontEntry[] = [];
  for (const font of manifest.fonts) {
    if (opts.ids && !opts.ids.includes(font.id)) {
      fonts.push(font);
      continue;
    }
    const row: FontSyncRow = { id: font.id, files: font.files.length, downloaded: 0, verified: 0, license: "skipped", tags: [], error: null };
    const next: FontEntry = structuredClone(font);
    try {
      const dir = path.join(root, font.id);
      await fs.mkdir(dir, { recursive: true });
      // License file: verify the marker text, pin its sha256, keep a copy next to the binaries.
      const licRes = await fetchImpl(rawSourceUrl(manifest.source.commit, font.license.path));
      if (!licRes.ok) throw new Error(`license fetch HTTP ${licRes.status}`);
      const licText = await licRes.text();
      row.license = LICENSE_MARKERS[font.license.id].test(licText) ? "verified" : "missing-marker";
      if (row.license !== "verified") throw new Error(`license file does not read as ${font.license.id}`);
      const licSha = crypto.createHash("sha256").update(licText).digest("hex");
      if (font.license.sha256 && font.license.sha256 !== licSha) throw new Error(`license sha256 changed (pinned ${font.license.sha256.slice(0, 12)})`);
      next.license.sha256 = licSha;
      await fs.writeFile(path.join(dir, "LICENSE.txt"), licText);
      const coverages: Array<z.infer<typeof FontCoverageSchema>> = [];
      for (let i = 0; i < font.files.length; i++) {
        const f = font.files[i]!;
        const local = path.join(dir, f.local);
        let buf: Buffer | null = null;
        try {
          buf = await fs.readFile(local);
        } catch {
          buf = null;
        }
        if (!buf || (f.sha256 && crypto.createHash("sha256").update(buf).digest("hex") !== f.sha256)) {
          const res = await fetchImpl(rawSourceUrl(manifest.source.commit, f.path));
          if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(local, buf);
          row.downloaded++;
        }
        const sha = crypto.createHash("sha256").update(buf).digest("hex");
        if (f.sha256 && f.sha256 !== sha) throw new Error(`${f.local}: sha256 mismatch against the pinned value`);
        row.verified++;
        const parsed = parseFont(buf);
        coverages.push(coverageFor(parsed));
        const weight = parsed.weightRange ? `${parsed.weightRange[0]} ${parsed.weightRange[1]}` : String(parsed.weightClass ?? 400);
        next.files[i] = { ...f, sha256: sha, bytes: buf.length, weight: /^\d{3,4}( \d{3,4})?$/.test(weight) ? weight : "400" };
      }
      next.coverage = mergeCoverage(coverages);
      row.tags = next.coverage.tags;
    } catch (e) {
      row.error = String((e as Error)?.message ?? e).slice(0, 300);
    }
    rows.push(row);
    fonts.push(row.error ? font : next);
  }
  return { manifest: { ...manifest, fonts }, rows };
}

// ── Lint: every font a catalog item names must be licensed ───────────────────

export type FontLintIssue = { severity: "error" | "warning"; code: string; where: string; message: string };

/** Families named in `font-family` declarations, in order (first = primary). */
export function fontFamilyDeclarations(css: string): string[][] {
  const out: string[][] = [];
  for (const m of css.matchAll(/font-family\s*:\s*([^;}<]+)/gi)) {
    const fams = m[1]!
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
      .filter((s) => s.length > 0 && !s.startsWith("$"));
    if (fams.length > 0) out.push(fams);
  }
  return out;
}

export function lintFontManifest(manifest: FontManifest, sources: Array<{ where: string; text: string }>, opts: { requirePinned?: boolean } = {}): FontLintIssue[] {
  const issues: FontLintIssue[] = [];
  const byFamily = new Map(manifest.fonts.map((f) => [f.family.toLowerCase(), f]));
  for (const f of manifest.fonts) {
    if (!(ALLOWED_FONT_LICENSES as readonly string[]).includes(f.license.id)) {
      issues.push({ severity: "error", code: "font.license-not-allowed", where: f.id, message: `${f.family}: license ${f.license.id} is not in ${ALLOWED_FONT_LICENSES.join(", ")}` });
    }
    if (opts.requirePinned !== false) {
      if (!f.license.sha256) issues.push({ severity: "error", code: "font.license-unpinned", where: f.id, message: `${f.family}: license file not verified (run ralphy catalog fonts sync --write)` });
      for (const file of f.files) {
        if (!file.sha256) issues.push({ severity: "error", code: "font.file-unpinned", where: `${f.id}/${file.local}`, message: `${f.family}: ${file.path} has no recorded sha256` });
      }
      if (!f.coverage) issues.push({ severity: "error", code: "font.coverage-missing", where: f.id, message: `${f.family}: glyph coverage not measured` });
      else if (!f.coverage.tags.includes("latin")) issues.push({ severity: "error", code: "font.no-latin", where: f.id, message: `${f.family}: missing basic Latin glyphs` });
    }
  }
  for (const p of manifest.pairs) {
    for (const role of ["display", "body"] as const) {
      const font = manifest.fonts.find((f) => f.id === p[role].font);
      if (font?.coverage && !font.coverage.tags.includes("cyrillic")) {
        issues.push({ severity: "warning", code: "font.pair-latin-only", where: p.id, message: `${p.id}: ${role} font ${font.family} has no Cyrillic; Russian text falls back` });
      }
    }
  }
  for (const src of sources) {
    for (const fams of fontFamilyDeclarations(src.text)) {
      fams.forEach((fam, i) => {
        const key = fam.toLowerCase();
        if (GENERIC_FAMILIES.has(key) || byFamily.has(key)) return;
        if (i > 0 && SYSTEM_FALLBACK_FAMILIES.has(key)) return;
        issues.push({
          severity: "error",
          code: "font.unlicensed",
          where: src.where,
          message: `font-family "${fam}" has no recorded license in catalog/fonts.json${i > 0 ? "" : " (primary family)"}`,
        });
      });
    }
  }
  return issues;
}

// ── Composition wiring: @font-face specs for the families a page uses ────────

/** Faces for every manifest family the HTML names, limited to files present under `dataDir`. */
export async function fontFacesForHtml(html: string, manifest: FontManifest, dataDir: string = fontsDataDir()): Promise<{ faces: FontFaceSpec[]; copies: Array<{ from: string; to: string }>; missing: string[] }> {
  const wanted = new Set(fontFamilyDeclarations(html).flat().map((f) => f.toLowerCase()));
  const faces: FontFaceSpec[] = [];
  const copies: Array<{ from: string; to: string }> = [];
  const missing: string[] = [];
  for (const font of manifest.fonts) {
    if (!wanted.has(font.family.toLowerCase())) continue;
    for (const f of font.files) {
      const from = path.join(dataDir, font.id, f.local);
      try {
        await fs.access(from);
      } catch {
        missing.push(`${font.id}/${f.local}`);
        continue;
      }
      const ext = path.extname(f.local).slice(1);
      faces.push({ family: font.family, file: `fonts/${f.local}`, weight: f.weight ?? "400", style: f.style, format: ext === "otf" ? "opentype" : ext === "woff2" ? "woff2" : "truetype" });
      copies.push({ from, to: `fonts/${f.local}` });
    }
  }
  return { faces, copies, missing };
}

/** Collect every font-family source the lint should check: catalog fragments plus the preview harness. */
export async function fontLintSources(): Promise<Array<{ where: string; text: string }>> {
  const dir = catalogSourceDir();
  const out: Array<{ where: string; text: string }> = [];
  const kinds = await fs.readdir(path.join(dir, "items"));
  for (const kind of kinds) {
    const kd = path.join(dir, "items", kind);
    for (const f of await fs.readdir(kd)) {
      if (f.endsWith(".html")) out.push({ where: `catalog/items/${kind}/${f}`, text: await fs.readFile(path.join(kd, f), "utf-8") });
    }
  }
  return out;
}
