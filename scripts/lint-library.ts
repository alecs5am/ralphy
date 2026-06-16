#!/usr/bin/env tsx
// scripts/lint-library.ts — #448 (library QA + broken-media checks)
//
// QA gate for the PUBLIC content library (landing/lib/library-v2/library.json).
// The library is becoming execution input (templates, recipes, seed Units), so a
// broken media URL or an incomplete record can misroute the agent or make a Unit
// unreproducible. This lint catches that.
//
// Mirrors scripts/lint-docs-links.ts: a CI-friendly FAST path (no network) for
// schema + referential integrity, and a SLOW path that probes media URLs over
// HEAD→GET. `fetchImpl` is injectable so the test exercises the net path offline.
//
// The reference fields the entities ACTUALLY carry (verified against the real
// library, not the type defs):
//   • Unit  → templateId (→ template block) · recipeIds[] (→ recipe blocks) ·
//             assetIds[] (→ asset blocks) · format (→ formats) · media[] URLs
//   • Block → kind/id/name/blurb; asset.sub; recipe.recipeKind
//   • Blueprint → unitId (→ a Unit)
// No entity carries a content-mode / guideline / benchmark slug, so this lint
// does NOT invent those checks — the only links are intra-library.
//
// CLI:
//   bun run lint:library            → full check (slow — probes media URLs)
//   bun run lint:library --no-net   → schema + refs only (fast — CI/pre-commit)

import fs from "node:fs";
import path from "node:path";

export type Severity = "fail" | "warn";
export type Category =
  | "schema"
  | "ref"
  | "media"
  | "provenance"
  | "preview";

export interface Finding {
  entityId: string;
  entityKind: "unit" | "block" | "blueprint" | "format" | "library";
  severity: Severity;
  category: Category;
  message: string;
  fix: string;
}

export interface LibraryDoc {
  schemaVersion?: number;
  formats?: Array<Record<string, unknown>>;
  units?: Array<Record<string, unknown>>;
  blocks?: Array<Record<string, unknown>>;
  blueprints?: Array<Record<string, unknown>>;
}

export type FetchImpl = (
  url: string,
  init: { method: string; redirect: "follow"; signal: AbortSignal },
) => Promise<{ status: number }>;

export interface LintOpts {
  /** Repo root (used to locate library.json when `doc` is not passed). */
  repo: string;
  /** Run the slow media-probe path. */
  net?: boolean;
  /** Inject for offline tests; defaults to global fetch. */
  fetchImpl?: FetchImpl;
  /** Probe an in-memory doc instead of reading from disk (tests). */
  doc?: LibraryDoc;
  /** Per-URL probe timeout. */
  timeoutMs?: number;
}

export interface LintResult {
  ok: boolean;
  scanned: { units: number; blocks: number; blueprints: number; formats: number };
  findings: Finding[];
}

export const LIBRARY_REL = path.join("landing", "lib", "library-v2", "library.json");

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ─── FAST checks (no network) ───────────────────────────────────────────────

function collectUrls(media: unknown): string[] {
  if (!Array.isArray(media)) return [];
  const out: string[] = [];
  for (const m of media) {
    if (m && typeof m === "object") {
      for (const k of ["src", "storageUrl", "poster"]) {
        const u = str((m as Record<string, unknown>)[k]);
        if (u.startsWith("http")) out.push(u);
      }
    }
  }
  return out;
}

function checkUnits(doc: LibraryDoc, findings: Finding[]): { mediaUrls: string[] } {
  const units = doc.units ?? [];
  const formatIds = new Set((doc.formats ?? []).map((f) => str(f.id)));
  const templateIds = new Set(
    (doc.blocks ?? []).filter((b) => b.kind === "template").map((b) => str(b.id)),
  );
  const recipeIds = new Set(
    (doc.blocks ?? []).filter((b) => b.kind === "recipe").map((b) => str(b.id)),
  );
  const assetIds = new Set(
    (doc.blocks ?? []).filter((b) => b.kind === "asset").map((b) => str(b.id)),
  );
  const mediaUrls: string[] = [];

  for (const u of units) {
    const id = str(u.id) || "(missing id)";

    // (a) schema completeness — required Unit fields.
    for (const field of ["id", "format", "title", "blurb"] as const) {
      if (!str(u[field])) {
        findings.push({
          entityId: id, entityKind: "unit", severity: "fail", category: "schema",
          message: `unit missing required field "${field}"`,
          fix: `set a non-empty "${field}" on the unit record`,
        });
      }
    }
    if (typeof u.mediaCount !== "number") {
      findings.push({
        entityId: id, entityKind: "unit", severity: "fail", category: "schema",
        message: `unit missing numeric "mediaCount"`,
        fix: `set "mediaCount" to the number of media items`,
      });
    }

    // (e) preview/thumbnail dimensions — every media item declares an aspect.
    const media = Array.isArray(u.media) ? (u.media as Array<Record<string, unknown>>) : [];
    if (media.length === 0) {
      findings.push({
        entityId: id, entityKind: "unit", severity: "fail", category: "media",
        message: `unit has no media`,
        fix: `add at least one media item ({ src, kind, aspect })`,
      });
    }
    for (const m of media) {
      if (!str(m.src)) {
        findings.push({
          entityId: id, entityKind: "unit", severity: "fail", category: "media",
          message: `media item missing "src"`,
          fix: `set the media item's "src" path`,
        });
      }
      if (!str(m.kind)) {
        findings.push({
          entityId: id, entityKind: "unit", severity: "fail", category: "schema",
          message: `media item missing "kind" (image|video)`,
          fix: `set the media item's "kind"`,
        });
      }
      if (!str(m.aspect)) {
        findings.push({
          entityId: id, entityKind: "unit", severity: "fail", category: "preview",
          message: `media item missing "aspect" (preview dimensions)`,
          fix: `set the media item's "aspect" (e.g. "9 / 16")`,
        });
      }
    }
    if (typeof u.mediaCount === "number" && media.length > 0 && u.mediaCount !== media.length) {
      findings.push({
        entityId: id, entityKind: "unit", severity: "fail", category: "schema",
        message: `mediaCount ${u.mediaCount} != media.length ${media.length}`,
        fix: `set mediaCount to ${media.length}`,
      });
    }

    // (b) referential integrity — format + provenance block ids resolve.
    const fmt = str(u.format);
    if (fmt && !formatIds.has(fmt)) {
      findings.push({
        entityId: id, entityKind: "unit", severity: "fail", category: "ref",
        message: `format "${fmt}" is not in formats`,
        fix: `use one of the declared format ids, or add the format`,
      });
    }

    // (d) provenance presence — a Unit should declare its template block.
    //     Empty/missing templateId is a soft gap (a few seed units predate
    //     provenance): warn, don't fail, so the real library stays green while
    //     the gap is still surfaced.
    const templateId = str(u.templateId);
    if (!templateId) {
      findings.push({
        entityId: id, entityKind: "unit", severity: "warn", category: "provenance",
        message: `unit has no templateId (provenance gap)`,
        fix: `set "templateId" to the structure block this unit reproduces`,
      });
    } else if (!templateIds.has(templateId)) {
      findings.push({
        entityId: id, entityKind: "unit", severity: "fail", category: "ref",
        message: `templateId "${templateId}" resolves to no template block`,
        fix: `point templateId at an existing kind:"template" block, or add it`,
      });
    }

    // recipeIds[] / assetIds[] are optional (a poster carries none) — only a
    // PRESENT id that resolves to nothing is a defect.
    for (const rid of (Array.isArray(u.recipeIds) ? u.recipeIds : []).map(str)) {
      if (rid && !recipeIds.has(rid)) {
        findings.push({
          entityId: id, entityKind: "unit", severity: "fail", category: "ref",
          message: `recipeId "${rid}" resolves to no recipe block`,
          fix: `point at an existing kind:"recipe" block, or drop the id`,
        });
      }
    }
    for (const aid of (Array.isArray(u.assetIds) ? u.assetIds : []).map(str)) {
      if (aid && !assetIds.has(aid)) {
        findings.push({
          entityId: id, entityKind: "unit", severity: "fail", category: "ref",
          message: `assetId "${aid}" resolves to no asset block`,
          fix: `point at an existing kind:"asset" block, or drop the id`,
        });
      }
    }

    mediaUrls.push(...collectUrls(u.media));
  }

  return { mediaUrls };
}

function checkBlocks(doc: LibraryDoc, findings: Finding[]): { refUrls: string[] } {
  const refUrls: string[] = [];
  for (const b of doc.blocks ?? []) {
    const id = str(b.id) || "(missing id)";
    for (const field of ["id", "kind", "name", "blurb"] as const) {
      if (!str(b[field])) {
        findings.push({
          entityId: id, entityKind: "block", severity: "fail", category: "schema",
          message: `block missing required field "${field}"`,
          fix: `set a non-empty "${field}" on the block`,
        });
      }
    }
    if (b.kind === "asset" && !str(b.sub)) {
      findings.push({
        entityId: id, entityKind: "block", severity: "fail", category: "schema",
        message: `asset block missing "sub" (character|location|prop|music)`,
        fix: `set the asset's "sub"`,
      });
    }
    if (b.kind === "recipe" && !str(b.recipeKind)) {
      findings.push({
        entityId: id, entityKind: "block", severity: "fail", category: "schema",
        message: `recipe block missing "recipeKind"`,
        fix: `set "recipeKind" (ffmpeg|encode|overlay|bake|hyperframes|prompt)`,
      });
    }
    for (const r of Array.isArray(b.refs) ? b.refs : []) {
      const u = str(r);
      if (u.startsWith("http")) refUrls.push(u);
    }
    const demo = b.demo as Record<string, unknown> | undefined;
    if (demo && typeof demo === "object") {
      for (const k of ["storageUrl", "beforeUrl", "afterUrl", "posterUrl"]) {
        const u = str(demo[k]);
        if (u.startsWith("http")) refUrls.push(u);
      }
    }
  }
  return { refUrls };
}

function checkBlueprints(doc: LibraryDoc, findings: Finding[]): void {
  const unitIds = new Set((doc.units ?? []).map((u) => str(u.id)));
  for (const bp of doc.blueprints ?? []) {
    const unitId = str(bp.unitId);
    if (!unitId) {
      findings.push({
        entityId: "(missing unitId)", entityKind: "blueprint", severity: "fail", category: "schema",
        message: `blueprint missing "unitId"`,
        fix: `set "unitId" to the Unit this blueprint reproduces`,
      });
    } else if (!unitIds.has(unitId)) {
      findings.push({
        entityId: unitId, entityKind: "blueprint", severity: "fail", category: "ref",
        message: `blueprint.unitId "${unitId}" resolves to no Unit`,
        fix: `point unitId at an existing unit, or remove the blueprint`,
      });
    }
  }
}

// ─── SLOW check (network) — probe media URLs ────────────────────────────────

async function probe(url: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let resp = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (resp.status === 405 || resp.status === 403 || resp.status === 404) {
      resp = await fetchImpl(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return resp.status;
  } finally {
    clearTimeout(t);
  }
}

// ─── Entry ──────────────────────────────────────────────────────────────────

export async function lintLibrary(opts: LintOpts): Promise<LintResult> {
  const doc: LibraryDoc =
    opts.doc ?? JSON.parse(fs.readFileSync(path.join(opts.repo, LIBRARY_REL), "utf8"));
  const findings: Finding[] = [];

  const { mediaUrls } = checkUnits(doc, findings);
  const { refUrls } = checkBlocks(doc, findings);
  checkBlueprints(doc, findings);

  if (opts.net) {
    const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init).then((r) => ({ status: r.status })));
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const urls = [...new Set([...mediaUrls, ...refUrls])];
    const batchSize = 8;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const statuses = await Promise.all(
        batch.map((u) => probe(u, fetchImpl, timeoutMs).catch((e) => ({ err: (e as Error).message }))),
      );
      for (let j = 0; j < batch.length; j++) {
        const s = statuses[j]!;
        const broken = typeof s === "number" ? !(s >= 200 && s < 400) : true;
        if (broken) {
          findings.push({
            entityId: batch[j]!, entityKind: "library", severity: "fail", category: "media",
            message: typeof s === "number" ? `media probe returned ${s}` : `media probe failed: ${s.err}`,
            fix: `re-upload or fix the media URL`,
          });
        }
      }
    }
  }

  // Group findings by entityId (stable order) for actionable output.
  findings.sort((a, b) => a.entityId.localeCompare(b.entityId));

  return {
    ok: !findings.some((f) => f.severity === "fail"),
    scanned: {
      units: (doc.units ?? []).length,
      blocks: (doc.blocks ?? []).length,
      blueprints: (doc.blueprints ?? []).length,
      formats: (doc.formats ?? []).length,
    },
    findings,
  };
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const net = !process.argv.includes("--no-net");
  const result = await lintLibrary({ repo, net });

  const fails = result.findings.filter((f) => f.severity === "fail");
  const warns = result.findings.filter((f) => f.severity === "warn");

  if (result.ok) {
    process.stdout.write(
      JSON.stringify({ ok: true, scanned: result.scanned, warnings: warns.length, net }) + "\n",
    );
    // Surface warnings without failing CI.
    for (const w of warns) process.stderr.write(`⚠ ${w.entityId} [${w.category}] ${w.message}\n`);
    process.exit(0);
  }

  process.stderr.write(JSON.stringify(result, null, 2) + "\n");
  for (const f of fails) {
    process.stderr.write(`✖ ${f.entityId} (${f.entityKind}) [${f.category}] ${f.message}\n    fix: ${f.fix}\n`);
  }
  process.stderr.write(`\n${fails.length} library defect(s) across ${result.scanned.units} units.\n`);
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-library.ts") || process.argv[1].endsWith("lint-library.js"));
if (isDirect) {
  void main();
}
