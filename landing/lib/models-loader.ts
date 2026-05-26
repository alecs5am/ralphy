// landing/lib/models-loader.ts
//
// Build-time loader for MODELS.md at the repo root. The same file
// `AGENTS.md` mandates reading before any model call — surfaced here as
// a public SEO-indexable page at /models so practical queries like
// "kling pricing", "seedance privacy filter", "gpt-5.4-image-2 concurrent
// limit" land directly on the curated knowledge.
//
// Used by landing/app/models/page.tsx as a Server Component data source —
// runs at build time, ships static HTML.

import fs from "node:fs";
import path from "node:path";

// process.cwd() is the `landing/` dir under both `next build` and `next dev`.
// __dirname is unreliable under turbopack (it bundles server code), so we
// resolve relative to cwd (mirrors guidelines-loader / blog-shared).
const REPO_ROOT = path.resolve(process.cwd(), "..");
const MODELS_PATH = path.join(REPO_ROOT, "MODELS.md");

export interface ModelsDoc {
  /** Raw markdown source (with the H1 + intro stripped — page renders its own header). */
  source: string;
  /** Last-reviewed date pulled from the "Last reviewed: YYYY-MM-DD" blockquote at the top. */
  lastReviewed: string | null;
  /** Days since lastReviewed, for the staleness chip. null if no date found. */
  staleDays: number | null;
  /** Section count (count of `^## ` headings) — used for the eyebrow stat. */
  sectionCount: number;
}

const STALE_THRESHOLD_DAYS = 30;

export function loadModelsDoc(): ModelsDoc {
  const raw = fs.readFileSync(MODELS_PATH, "utf8");

  // Strip the H1 ("# Models registry") and the intro paragraph that the
  // page renders explicitly in its hero.
  const lines = raw.split("\n");
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    // First H2 begins the body content.
    if (/^##\s/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  const source = lines.slice(startIdx).join("\n");

  // Last-reviewed: pulled from the "**Last reviewed: 2026-05-08.**" pattern
  // in the intro blockquote.
  const reviewMatch = raw.match(/Last reviewed:\s*(\d{4}-\d{2}-\d{2})/);
  const lastReviewed = reviewMatch?.[1] ?? null;
  const staleDays = lastReviewed
    ? Math.floor(
        (Date.now() - Date.parse(lastReviewed)) / (1000 * 60 * 60 * 24),
      )
    : null;

  // Section count = number of H2 headings in the body.
  const sectionCount = (source.match(/^##\s/gm) ?? []).length;

  return { source, lastReviewed, staleDays, sectionCount };
}

export function isStale(staleDays: number | null): boolean {
  return staleDays !== null && staleDays > STALE_THRESHOLD_DAYS;
}
