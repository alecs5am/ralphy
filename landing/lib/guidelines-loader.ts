// landing/lib/guidelines-loader.ts
//
// Build-time loader for the guidelines/ directory at the repo root.
// Reads `guidelines/<slug>/guideline.json` (metadata), `guideline.md` (the
// LLM-facing body), and `examples.json` (curated media list).
//
// Used by landing/app/library/page.tsx and library/[slug]/page.tsx as a
// Server Component data source — runs at build time, ships static HTML.

import fs from "node:fs";
import path from "node:path";
import type { LibraryEntry, LibraryKind } from "./library-types";

export type { LibraryEntry, LibraryKind, LibraryCta, LibraryCover } from "./library-types";
export { KIND_LABELS, KIND_GROUPS } from "./library-types";

// process.cwd() is the `landing/` dir under both `next build` and `next dev`.
// __dirname is unreliable under turbopack (it bundles server code into
// `.next/...`), so resolve relative to cwd instead.
const REPO_ROOT = path.resolve(process.cwd(), "..");
const GUIDELINES_DIR = path.join(REPO_ROOT, "guidelines");
const ASSET_BASE = "/assets/guidelines";

/** Alias kept for existing detail-page imports. */
export type GuidelineMeta = LibraryEntry;

export interface GuidelineExample {
  id: string;
  src: string;
  caption: string;
  kind: "image" | "video";
  aspect: string;       // "9:16" | "16:9" | "1:1" | "4:5" | …  (CSS aspect-ratio "W / H")
  pattern?: string;
  model?: string;
  project?: string;
}

export interface GuidelineFull extends GuidelineMeta {
  body: string;
  examples: GuidelineExample[];
}

interface RawMeta {
  slug?: string;
  name?: string;
  tag?: string;
  kind?: string;
  tagline?: string;
  description?: string;
  models?: string[];
  tags?: string[];
  version?: string;
  cover?: string;
  patterns?: string[];
}

interface RawExamples {
  slug?: string;
  items?: Array<{
    id?: string;
    media?: string;
    kind?: "image" | "video";
    aspect?: string;
    caption?: string;
    pattern?: string;
    model?: string;
    project?: string;
  }>;
}

/** Coerce an aspect string like "16:9" / "9 / 16" into the CSS form "16 / 9". */
function normalizeAspect(input: string | undefined, fallback = "9 / 16"): string {
  if (!input) return fallback;
  const m = input.match(/(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  return `${m[1]} / ${m[2]}`;
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function readExamples(slug: string, dir: string): GuidelineExample[] {
  const raw = readJson<RawExamples>(path.join(dir, "examples.json"));
  return (raw?.items ?? [])
    .filter((it) => it.media)
    .map((it) => ({
      id: it.id ?? it.media ?? "",
      src: `${ASSET_BASE}/${slug}/${it.media}`,
      caption: it.caption ?? "",
      kind: it.kind ?? "image",
      aspect: normalizeAspect(it.aspect),
      pattern: it.pattern,
      model: it.model,
      project: it.project,
    }));
}

// Cover resolution: explicit `cover` field in guideline.json wins (looked up
// in examples by id, or treated as a bare filename), else the first example
// is used. Guidelines without any examples render coverless and the card
// falls back to the type-only layout.
function pickCover(
  slug: string,
  raw: RawMeta,
  examples: GuidelineExample[],
): GuidelineMeta["cover"] | undefined {
  if (raw.cover) {
    const hit = examples.find((e) => e.id === raw.cover);
    if (hit) return { src: hit.src, kind: hit.kind, alt: hit.caption || raw.name || slug, aspect: hit.aspect };
    return {
      src: `${ASSET_BASE}/${slug}/${raw.cover}`,
      kind: raw.cover.endsWith(".mp4") || raw.cover.endsWith(".webm") ? "video" : "image",
      alt: raw.name || slug,
      aspect: normalizeAspect(undefined),
    };
  }
  const first = examples[0];
  if (!first) return undefined;
  return { src: first.src, kind: first.kind, alt: first.caption || raw.name || slug, aspect: first.aspect };
}

function metaFromRaw(slug: string, raw: RawMeta, examples: GuidelineExample[]): GuidelineMeta {
  const tag = raw.tag ?? `@guideline:${slug}`;
  const kind: LibraryKind = (raw.kind as LibraryKind) ?? "image-prompt";
  return {
    slug: raw.slug ?? slug,
    name: raw.name ?? slug,
    tag,
    kind,
    tagline: raw.tagline,
    description: (raw.description ?? "").trim() || undefined,
    models: raw.models ?? [],
    tags: raw.tags ?? [],
    version: raw.version,
    cover: pickCover(slug, raw, examples),
    patterns: raw.patterns ?? [],
    sourcePath: `guidelines/${slug}`,
    cta: {
      label: "Try in Ralphy",
      tag,
      hintCmd: `ralphy guideline show ${slug}`,
    },
    href: { kind: "internal", url: `/library/${slug}` },
  };
}

export function loadGuidelines(): GuidelineMeta[] {
  if (!fs.existsSync(GUIDELINES_DIR)) return [];
  const rows: GuidelineMeta[] = [];
  for (const ent of fs.readdirSync(GUIDELINES_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".") || ent.name.startsWith("_")) continue;
    const dir = path.join(GUIDELINES_DIR, ent.name);
    const raw = readJson<RawMeta>(path.join(dir, "guideline.json"));
    if (!raw) continue;
    const examples = readExamples(ent.name, dir);
    rows.push(metaFromRaw(ent.name, raw, examples));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function loadGuideline(slug: string): GuidelineFull | null {
  const dir = path.join(GUIDELINES_DIR, slug);
  if (fs.existsSync(dir)) {
    const raw = readJson<RawMeta>(path.join(dir, "guideline.json"));
    if (!raw) return null;
    const examples = readExamples(slug, dir);
    const meta = metaFromRaw(slug, raw, examples);

    let body = "";
    const bodyPath = path.join(dir, "guideline.md");
    if (fs.existsSync(bodyPath)) body = fs.readFileSync(bodyPath, "utf8");

    return { ...meta, body, examples };
  }

  // Showcase fallback — slug doesn't have a folder under guidelines/, but
  // it might be a clip from the landing's Showcase rail surfaced as a
  // recreate-video remix entry.
  // Lazy-load to avoid pulling clips[] (and its data.tsx neighbours) into
  // the bundle when not needed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clipsMod = require("./library-clips") as typeof import("./library-clips");
  const showcase = clipsMod.showcaseClipAsFull(slug);
  return showcase ?? null;
}

export function listGuidelineSlugs(): string[] {
  const fromDisk = loadGuidelines().map((g) => g.slug);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clipsMod = require("./library-clips") as typeof import("./library-clips");
  const fromShowcase = clipsMod.listShowcaseSlugs();
  return Array.from(new Set([...fromDisk, ...fromShowcase]));
}
