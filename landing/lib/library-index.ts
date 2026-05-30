// landing/lib/library-index.ts
//
// Build-time assembly of the unified, format-organized library index (issue
// 054). Server-only (imports node:fs via the loaders). Runs once per `next
// build`, producing a flat `LibraryItem[]` plus precomputed per-format counts
// and lowercase search haystacks. The client `LibraryListing` receives this as
// plain JSON and filters/paginates it entirely client-side, so search stays
// fast and the URL query params are the single source of truth.
//
// Three sources fold into one surface (issue 054 — "fold /templates into
// /library, one discovery surface"):
//   1. templates/   — the universal content unit, organized by `format`
//                     (templates-loader.ts). Primary axis of the page.
//   2. guidelines/  — image-prompt rule libraries (@guideline:<slug>).
//   3. showcase     — the landing's hero clips, each a vibe-reference template
//                     the user can remix end-to-end (@template:<slug>).

import { loadTemplates, type TemplateRow, type TemplateFormat } from "./templates-loader";
import { loadGuidelines } from "./guidelines-loader";
import { loadShowcaseClips } from "./library-clips";
import { showcaseCover, showcasePreview } from "./showcase-loader";
import {
  LIBRARY_FORMATS,
  type LibraryFormat,
  type LibraryIndex,
  type LibraryItem,
} from "./library-index-types";

function isFormat(f: TemplateFormat | undefined): f is LibraryFormat {
  return f !== undefined && (LIBRARY_FORMATS as string[]).includes(f);
}

/** Format → a tasteful designed-fallback aspect (matches how the format ships).
 *  Used by the card's gradient fallback when a template has no media cover. */
const FALLBACK_ASPECT: Record<string, string> = {
  video: "9 / 16",
  image: "1 / 1",
  carousel: "4 / 5",
  "fb-creative": "1 / 1",
  "motion-design": "16 / 9",
  poster: "4 / 5",
  "sticker-pack": "1 / 1",
};

/** Templates are the primary unit. They carry the `format` + `style_of`
 * taxonomy and reproduce via `@template:<slug>`. Each links to its own on-disk
 * detail page (`/library/<slug>`); GitHub is demoted to a secondary link on the
 * detail page itself. Covers come from the first hosted showcase output, else a
 * declared thumbnail / reference, else a designed format-keyed fallback. */
function templateItem(t: TemplateRow): LibraryItem {
  const format = isFormat(t.format) ? t.format : undefined;
  const tag = `@template:${t.slug}`;
  const cliCmd = `ralphy template use ${t.slug} --project <id> --brief "..."`;
  const text = [
    t.name,
    t.slug,
    t.description,
    t.category,
    t.platform ?? "",
    format ?? "",
    t.kind,
    ...t.tags,
  ]
    .join(" ")
    .toLowerCase();

  // Cover precedence: hosted showcase media (the dense-gallery effect) → a
  // declared thumbnail / reference → undefined (the card renders a designed
  // format-keyed fallback, never an empty dark box).
  const sc = showcaseCover(t.slug);
  const preview = showcasePreview(t.slug) ?? undefined;
  const fallbackAspect = (format && FALLBACK_ASPECT[format]) || "4 / 5";
  const cover = sc
    ? { src: sc.src, kind: sc.kind, poster: sc.poster, alt: t.name, aspect: sc.aspect }
    : t.thumbnail
      ? { src: t.thumbnail, kind: "image" as const, alt: t.name, aspect: fallbackAspect }
      : t.referenceMp4
        ? { src: t.referenceMp4, kind: "video" as const, alt: t.name, aspect: fallbackAspect }
        : undefined;

  return {
    key: `template:${t.slug}`,
    slug: t.slug,
    source: "template",
    name: t.name,
    format,
    styleOf: t.styleOf,
    isGeneral: !t.styleOf,
    tagline: t.description.slice(0, 180) || undefined,
    tags: t.tags,
    models: [],
    category: t.category,
    tag,
    cliCmd,
    cover,
    preview,
    href: { kind: "internal", url: `/library/${t.slug}` },
    text,
  };
}

/** Showcase clips are vibe-reference video templates with a real cover video
 * and an on-disk detail page (`/library/<slug>`). They are always `video`. */
function showcaseItem(c: ReturnType<typeof loadShowcaseClips>[number]): LibraryItem {
  const text = [c.name, c.slug, c.tagline ?? "", ...c.tags, ...c.models].join(" ").toLowerCase();
  return {
    key: `showcase:${c.slug}`,
    slug: c.slug,
    source: "showcase",
    name: c.name,
    format: "video",
    styleOf: undefined,
    isGeneral: false,
    tagline: c.tagline,
    tags: c.tags,
    models: c.models,
    tag: c.cta.tag,
    cliCmd: c.cta.hintCmd,
    cover: c.cover,
    href: c.href,
    text,
  };
}

/** Image-prompt guidelines map to the `image` format. They reproduce via
 * `@guideline:<slug>` and have an on-disk detail page. */
function guidelineItem(g: ReturnType<typeof loadGuidelines>[number]): LibraryItem {
  const text = [g.name, g.slug, g.tagline ?? "", g.description ?? "", ...g.tags, ...g.models]
    .join(" ")
    .toLowerCase();
  // recreate-video guidelines are video remixes; image-prompt guidelines are
  // the image-format prompt libraries.
  const format: LibraryFormat = g.kind === "recreate-video" ? "video" : "image";
  return {
    key: `guideline:${g.slug}`,
    slug: g.slug,
    source: "guideline",
    name: g.name,
    format,
    styleOf: undefined,
    isGeneral: false,
    tagline: g.tagline,
    tags: g.tags,
    models: g.models,
    tag: g.cta.tag,
    cliCmd: g.cta.hintCmd,
    cover: g.cover,
    href: g.href,
    text,
  };
}

/**
 * Build the full index. De-dupes by slug across sources with this precedence:
 *   showcase (has a real cover + detail page) > template (has format taxonomy)
 *   > guideline. In practice the three slug-spaces are disjoint today, but the
 * de-dupe keeps a future slug collision from producing two cards.
 */
// Hero clips that duplicate an example-backed template category (issue: library
// content normalization). They remain in the homepage hero mosaic (data.tsx →
// `clips`) but are NOT surfaced as separate library cards — the canonical
// template category already shows the equivalent outputs. The two genuinely
// unique clips (glitter-cream-001, nothing-hp1-001) are intentionally kept.
const HIDE_SLUGS = new Set<string>([
  "noski-people-001", // → noski-deadpan-2hander
  "analog-horror-fridge-001", // → analog-horror-psa
  "ralphy-vs-higgsfield-001", // → analog-horror-psa (pick-a-door)
  "flipper-hypermotion-001", // → japanese-hypermotion-product-ad (Hyper-Motion Ad)
  "occult-mockumentary-001", // → found-footage-mockumentary
  "fruit-drama-001", // → ai-vegetables (AI object/food drama)
  "playdate-pixel-001", // → japanese-hypermotion-product-ad (folded with pixel-art)
  "kbo-broadcast-001", // → broadcast-caught-on-tv-square
  "tokyo-y2k-001", // → tokyo-y2k-cinematic
  "skater-spiderverse-001", // → cartoon (Seedance Cartoon)
  "arena-rocker-001", // → cartoon (Seedance Cartoon)
  "glitter-cream-001", // → before-after-product (UGC Ad) — it IS that template's reference render
  // Guideline cards that duplicate a template category:
  "y2k-streetwear-poster", // → streetwear-drop-poster (same poster concept)
  "cgi-product-renders", // → japanese-hypermotion-product-ad (Hyper-Motion Ad)
]);

export function buildLibraryIndex(): LibraryIndex {
  const bySlug = new Map<string, LibraryItem>();
  const rank: Record<LibraryItem["source"], number> = { showcase: 3, template: 2, guideline: 1 };

  const consider = (item: LibraryItem) => {
    const existing = bySlug.get(item.slug);
    if (!existing || rank[item.source] > rank[existing.source]) {
      // When a showcase clip wins over a template of the same slug, carry the
      // template's format/styleOf so the format nav stays correct.
      if (existing && existing.source === "template" && item.source === "showcase") {
        item.format = existing.format ?? item.format;
        item.styleOf = existing.styleOf;
      }
      bySlug.set(item.slug, item);
    } else if (
      existing.source === "showcase" &&
      item.source === "template" &&
      !existing.format
    ) {
      existing.format = item.format;
      existing.styleOf = item.styleOf;
    }
  };

  for (const t of loadTemplates()) consider(templateItem(t));
  for (const c of loadShowcaseClips()) consider(showcaseItem(c));
  for (const g of loadGuidelines()) consider(guidelineItem(g));

  const items = Array.from(bySlug.values())
    // Content gate: a library card must have a real preview (cover) and must not
    // be a hidden duplicate. Empty placeholder templates (no showcase media, no
    // thumbnail) carry no cover and are dropped here — they still exist on disk
    // for `ralphy template suggest`, they just don't surface as cards.
    .filter((it) => !!it.cover && !HIDE_SLUGS.has(it.slug))
    .sort((a, b) => {
      // General baselines first within a format, then alphabetical by name.
      if (a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const formatCounts: Record<string, number> = {};
  for (const f of LIBRARY_FORMATS) formatCounts[f] = 0;
  for (const it of items) {
    if (it.format) formatCounts[it.format] = (formatCounts[it.format] ?? 0) + 1;
  }

  return { items, formatCounts, total: items.length };
}
