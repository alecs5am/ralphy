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
  // ── Backward-compatible grouping extension (issue 060) ──────────────────────
  // Outputs with no `group` render as one flat grid (legacy behavior). Outputs
  // that share a `group` are rendered together as a campaign / pack / carousel
  // sub-section by the per-format detail components.
  /** Group id this output belongs to (campaign set, sticker pack, carousel id). */
  group?: string;
  /** Human title for the group's sub-section header. */
  groupTitle?: string;
  /** Order within the group (ascending). Falls back to manifest order. */
  order?: number;
  /** Poster frame for a video tile, if a sibling `<stem>.poster.jpg` exists. */
  poster?: string;
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
    type?: ShowcaseMediaKind;
    group?: string;
    groupTitle?: string;
    order?: number;
    aspect?: string;
  }>;
}

/** Coerce an aspect string like "4:5" / "9 / 16" into the CSS form "4 / 5". */
function normalizeAspect(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const m = input.match(/(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  return `${m[1]} / ${m[2]}`;
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
): { src: string; kind: ShowcaseMediaKind; poster?: string } | null {
  // Absolute public path (starts with "/") — serve verbatim, no per-slug
  // resolution. Used to point a library output at an already-shipped asset
  // (e.g. the homepage hero clip under /assets/showcase/<id>.mp4) instead of
  // duplicating the bytes under /showcase/<slug>/.
  if (media.startsWith("/")) {
    const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(media);
    return { src: media, kind: isVideo ? "video" : "image" };
  }
  const base = path.basename(media);
  const stem = base.replace(/\.[^.]+$/, "");
  const dir = path.join(PUBLIC_SHOWCASE_DIR, slug);
  if (!fs.existsSync(dir)) return null;

  const isVideoSource = /\.(mp4|webm|mov|m4v)$/i.test(base);
  const poster = `${stem}.poster.jpg`;
  const posterUrl = fs.existsSync(path.join(dir, poster))
    ? `${PUBLIC_SHOWCASE_BASE}/${slug}/${poster}`
    : undefined;

  if (isVideoSource) {
    // A small mp4 copied verbatim renders as inline video (with poster if any).
    if (fs.existsSync(path.join(dir, base))) {
      return { src: `${PUBLIC_SHOWCASE_BASE}/${slug}/${base}`, kind: "video", poster: posterUrl };
    }
    // Else a committed poster frame stands in as a static image tile.
    if (posterUrl) return { src: posterUrl, kind: "image" };
    return null;
  }

  // Image source copied verbatim. Also try a `.webp` derivative of the same
  // stem — the rich-content pass commits optimized webp under the same name.
  for (const candidate of [base, `${stem}.webp`, `${stem}.jpg`]) {
    if (fs.existsSync(path.join(dir, candidate))) {
      return { src: `${PUBLIC_SHOWCASE_BASE}/${slug}/${candidate}`, kind: "image" };
    }
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
      aspect:
        normalizeAspect(o.aspect) ||
        (o.format && FORMAT_ASPECT[o.format]) ||
        "1 / 1",
      caption: o.caption,
      sourceProject: o.source_project,
      format: o.format,
      created: o.created,
      group: o.group,
      groupTitle: o.groupTitle,
      order: o.order,
      poster: resolved.poster,
    });
  }
  // Stable sort by group then by `order` (manifest order is preserved when no
  // explicit order is given, since Array.sort is stable in modern V8/Node).
  out.sort((a, b) => {
    const ga = a.group ?? "";
    const gb = b.group ?? "";
    if (ga !== gb) return 0; // keep relative order across groups as authored
    return (a.order ?? 0) - (b.order ?? 0);
  });
  return out;
}

/** A cover descriptor derived from the first hosted showcase output for a slug,
 *  used by the library index to put a real cover on every card. Returns null
 *  when the slug has no hosted showcase media. Videos carry their poster. */
export function showcaseCover(slug: string): {
  src: string;
  kind: ShowcaseMediaKind;
  poster?: string;
  aspect: string;
} | null {
  const outputs = loadShowcase(slug);
  if (outputs.length === 0) return null;
  const first = outputs[0];
  return {
    src: first.src,
    kind: first.kind,
    poster: first.poster,
    aspect: first.aspect,
  };
}

/** Per-format card-media preview for a slug: the total hosted-output count and
 *  up to `max` representative image srcs, spread evenly across the set (so an
 *  FB pack's 2×2 peek samples different sets, not just the first four). Returns
 *  null when the slug has no hosted image outputs. */
export function showcasePreview(
  slug: string,
  max = 4,
): { count: number; srcs: string[] } | null {
  const outputs = loadShowcase(slug);
  if (outputs.length === 0) return null;
  const images = outputs.filter((o) => o.kind === "image");
  if (images.length === 0) return { count: outputs.length, srcs: [] };
  const n = Math.min(max, images.length);
  const step = images.length / n;
  const srcs = Array.from({ length: n }, (_, i) => images[Math.floor(i * step)].src);
  return { count: outputs.length, srcs };
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
  const tpl = findTemplateMeta(slug);
  if (!tpl) return null;

  const outputs = loadShowcase(slug);
  const cover = outputs[0];
  const tag = `@template:${slug}`;
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
    cover: cover
      ? { src: cover.src, kind: cover.kind, alt: tpl.name, aspect: cover.aspect, poster: cover.poster }
      : undefined,
    patterns: [],
    sourcePath: `${REPO_TREE_BASE}${tpl.sourcePath}`,
    cta: { label: "Remix in Ralphy", tag, hintCmd: `ralphy template use ${slug}` },
    href: { kind: "internal", url: `/library/${slug}` },
    body: "",
    examples: [],
  };
}

/** The `format` declared for a template slug (read from its template.yaml).
 *  Drives the per-format detail gallery component registry. */
export function templateFormat(slug: string): string | undefined {
  if (!fs.existsSync(TEMPLATES_DIR)) return undefined;
  for (const cat of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith(".")) continue;
    const yamlPath = path.join(TEMPLATES_DIR, cat.name, slug, "template.yaml");
    if (!fs.existsSync(yamlPath)) continue;
    try {
      const text = fs.readFileSync(yamlPath, "utf8");
      const m = /^format:\s*"?([a-z-]+)"?\s*$/m.exec(text);
      if (m) return m[1];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Every template slug on disk (with a template.json), regardless of showcase
 *  state — so the detail page's generateStaticParams covers ALL templates and
 *  no card links to a 404. */
export function listAllTemplateSlugs(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  const slugs: string[] = [];
  for (const cat of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith(".")) continue;
    const catDir = path.join(TEMPLATES_DIR, cat.name);
    for (const tpl of fs.readdirSync(catDir, { withFileTypes: true })) {
      if (!tpl.isDirectory()) continue;
      if (fs.existsSync(path.join(catDir, tpl.name, "template.json"))) slugs.push(tpl.name);
    }
  }
  return slugs;
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
