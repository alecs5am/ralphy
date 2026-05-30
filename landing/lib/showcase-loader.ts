// landing/lib/showcase-loader.ts
//
// Build-time loader for per-template results / showcase galleries (issue 055).
// Walks `templates/<category>/<slug>/showcase/showcase.json` (seeded by the
// dev-publish-template flow, issue 058) and returns the resolved outputs[] for
// a given template slug, ready to render in `TemplateShowcase`.
//
// Server-only (imports node:fs). Runs at `next build` time and ships static
// HTML, just like guidelines-loader.ts / templates-loader.ts.
//
// ── Media-resolution convention ──────────────────────────────────────────────
// A `showcase.json` `media` path points under `workspace/projects/...`, which is
// gitignored — the landing build cannot read it, and the heavy renders should
// NOT be committed to the landing bundle. So each output is resolved against a
// LIGHTWEIGHT, web-servable copy under `landing/public/showcase/<slug>/`:
//
//   - Image output  → the source still copied verbatim (small PNGs are fine).
//   - Video output  → the mp4 copied IF it is small (≤ ~3 MB), else a poster
//                     frame extracted with ffmpeg and committed as a static
//                     thumbnail (`<basename>.poster.jpg`). The gallery then
//                     shows the poster as an image tile (no inline playback).
//
// The committed public file is matched by BASENAME of the `media` path (the
// `.poster.jpg` sibling is tried first for videos). When no committed asset
// exists for an output, that output is treated as NOT-YET-HOSTED and skipped —
// so a template that seeded a `showcase.json` but whose media was never copied
// degrades to an empty gallery (renders nothing) rather than a broken tile.
//
// The eventual home for the heavy source media is the `ralphy-assets` companion
// repo (issue 059 repo-split plan); until that lands, the small committed
// derivatives under `landing/public/showcase/` are the source of truth the
// build reads.

import fs from "node:fs";
import path from "node:path";
import type { GuidelineFull } from "./guidelines-loader";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");
// Public web root for the copied derivatives + the URL prefix they serve from.
const PUBLIC_SHOWCASE_DIR = path.join(process.cwd(), "public", "showcase");
const PUBLIC_SHOWCASE_BASE = "/showcase";

export type ShowcaseMediaKind = "image" | "video";

/** One resolved, web-servable showcase output for a template detail page. */
export interface ShowcaseOutput {
  id: string;
  /** Public URL the gallery renders (`/showcase/<slug>/...`). */
  src: string;
  /** How to render `src`. A video whose mp4 was too big to commit resolves to
   *  an `image` poster instead, so the gallery never points at a missing mp4. */
  kind: ShowcaseMediaKind;
  /** CSS aspect-ratio ("W / H"); best-effort from the declared `format`. */
  aspect: string;
  caption?: string;
  /** The project that produced this output (provenance, not a link). */
  sourceProject?: string;
  /** Declared media format from the manifest (e.g. "sticker-pack"). */
  format?: string;
  created?: string;
}

interface RawShowcase {
  version?: number;
  slug?: string;
  outputs?: Array<{
    id?: string;
    source_project?: string;
    media?: string;
    format?: string;
    caption?: string;
    created?: string;
  }>;
}

// Format → default aspect-ratio. Renders vary, but these match how each format
// is shot in the seeded set: square fb-creative, portrait sticker, etc.
const FORMAT_ASPECT: Record<string, string> = {
  video: "9 / 16",
  image: "1 / 1",
  carousel: "4 / 5",
  "fb-creative": "1 / 1",
  "motion-design": "16 / 9",
  poster: "4 / 5",
  "sticker-pack": "1 / 1",
};

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Resolve a manifest `media` path to a committed public derivative, or null
 *  when nothing has been hosted for it yet. Videos prefer a `.poster.jpg`
 *  sibling (rendered as a static image), then fall back to a same-name mp4. */
function resolvePublicMedia(
  slug: string,
  media: string,
): { src: string; kind: ShowcaseMediaKind } | null {
  const base = path.basename(media);
  const stem = base.replace(/\.[^.]+$/, "");
  const dir = path.join(PUBLIC_SHOWCASE_DIR, slug);
  if (!fs.existsSync(dir)) return null;

  const isVideoSource = /\.(mp4|webm|mov|m4v)$/i.test(base);

  if (isVideoSource) {
    // Prefer a committed poster frame (the >3 MB-mp4 path).
    const poster = `${stem}.poster.jpg`;
    if (fs.existsSync(path.join(dir, poster))) {
      return { src: `${PUBLIC_SHOWCASE_BASE}/${slug}/${poster}`, kind: "image" };
    }
    // Else a small mp4 copied verbatim.
    if (fs.existsSync(path.join(dir, base))) {
      return { src: `${PUBLIC_SHOWCASE_BASE}/${slug}/${base}`, kind: "video" };
    }
    return null;
  }

  // Image source copied verbatim.
  if (fs.existsSync(path.join(dir, base))) {
    return { src: `${PUBLIC_SHOWCASE_BASE}/${slug}/${base}`, kind: "image" };
  }
  return null;
}

/** Locate the `showcase.json` for a slug across every `templates/<cat>/` dir.
 *  Returns the parsed manifest or null. */
function findShowcaseManifest(slug: string): RawShowcase | null {
  if (!fs.existsSync(TEMPLATES_DIR)) return null;
  for (const cat of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith(".")) continue;
    const file = path.join(TEMPLATES_DIR, cat.name, slug, "showcase", "showcase.json");
    const raw = readJson<RawShowcase>(file);
    if (raw) return raw;
  }
  return null;
}

/**
 * Load the resolved, web-servable showcase outputs for a template slug. Returns
 * an empty array when the template has no manifest OR none of its outputs have a
 * committed public derivative yet — the gallery renders nothing in that case.
 */
export function loadShowcase(slug: string): ShowcaseOutput[] {
  const raw = findShowcaseManifest(slug);
  if (!raw?.outputs?.length) return [];

  const out: ShowcaseOutput[] = [];
  for (const o of raw.outputs) {
    if (!o.media || !o.id) continue;
    const resolved = resolvePublicMedia(slug, o.media);
    if (!resolved) continue; // not yet hosted — skip, do not point at gitignored media
    out.push({
      id: o.id,
      src: resolved.src,
      kind: resolved.kind,
      aspect: (o.format && FORMAT_ASPECT[o.format]) || "1 / 1",
      caption: o.caption,
      sourceProject: o.source_project,
      format: o.format,
      created: o.created,
    });
  }
  return out;
}

const REPO_TREE_BASE = "https://github.com/alecs5am/ralphy/tree/main/";

interface TemplateMeta {
  name: string;
  description: string;
  tags: string[];
  sourcePath: string;
}

/** Read a template's `template.json` directly (name / description / tags) for a
 *  given slug, resolving paths against `process.cwd()` like the rest of this
 *  module. We do NOT reuse templates-loader.ts here because it resolves its
 *  templates dir from `__dirname`, which is unreliable under the Next.js server
 *  bundle (the loader's own comment flags this) — so the slug would silently
 *  miss at build time and the detail page would 404. */
function findTemplateMeta(slug: string): TemplateMeta | null {
  if (!fs.existsSync(TEMPLATES_DIR)) return null;
  for (const cat of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith(".")) continue;
    const dir = path.join(TEMPLATES_DIR, cat.name, slug);
    const raw = readJson<{ name?: string; description?: string; tags?: string[] }>(
      path.join(dir, "template.json"),
    );
    if (!raw) continue;
    return {
      name: raw.name || slug,
      description: (raw.description || "").trim(),
      tags: raw.tags || [],
      sourcePath: `templates/${cat.name}/${slug}`,
    };
  }
  return null;
}

/**
 * Build a `GuidelineFull`-shaped record for a template slug that has a showcase
 * gallery but no `guidelines/<slug>/` folder, so the detail page (`/library/
 * [slug]`) can render its recipe hero + remix steps. Mirrors the showcase-clip
 * fallback in `library-clips.ts`. Returns null when the slug is not a template
 * with a hosted showcase. The first showcase output is reused as the hero cover.
 */
export function templateShowcaseAsFull(slug: string): GuidelineFull | null {
  const outputs = loadShowcase(slug);
  if (outputs.length === 0) return null;
  const tpl = findTemplateMeta(slug);
  if (!tpl) return null;

  const tag = `@template:${slug}`;
  const cover = outputs[0];
  return {
    slug,
    name: tpl.name,
    tag,
    kind: "recreate-video",
    tagline: tpl.description || undefined,
    description: tpl.description || undefined,
    models: [],
    tags: tpl.tags,
    version: undefined,
    cover: {
      src: cover.src,
      kind: cover.kind,
      alt: tpl.name,
      aspect: cover.aspect,
    },
    patterns: [],
    sourcePath: `${REPO_TREE_BASE}${tpl.sourcePath}`,
    cta: { label: "Remix in Ralphy", tag, hintCmd: `ralphy template use ${slug}` },
    href: { kind: "internal", url: `/library/${slug}` },
    body: "",
    examples: [],
  };
}

/** Slugs that have a committed (renderable) showcase gallery. Used by the
 *  detail page's `generateStaticParams` so a template with a results gallery
 *  gets an on-disk detail page even when it has no guideline folder. */
export function listShowcaseTemplateSlugs(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  const slugs: string[] = [];
  for (const cat of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith(".")) continue;
    const catDir = path.join(TEMPLATES_DIR, cat.name);
    for (const tpl of fs.readdirSync(catDir, { withFileTypes: true })) {
      if (!tpl.isDirectory()) continue;
      const manifest = path.join(catDir, tpl.name, "showcase", "showcase.json");
      if (!fs.existsSync(manifest)) continue;
      // Only surface a detail page when at least one output is actually hosted.
      if (loadShowcase(tpl.name).length > 0) slugs.push(tpl.name);
    }
  }
  return slugs;
}
