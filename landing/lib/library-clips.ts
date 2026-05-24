// landing/lib/library-clips.ts
//
// Adapter: the landing's showcase clips (data.tsx → `clips`) double as
// `recreate-video` library entries. Each clip is a vibe-reference template
// the user can remix end-to-end via the template-use verb.
//
// Implementation note: we re-declare a minimal Clip type here instead of
// importing `clips` from data.tsx because data.tsx contains JSX in other
// exports — keeping this file JSX-free lets the server bundle stay small.

import { clips, type Clip } from "./data";
import type { GuidelineFull, GuidelineMeta, LibraryKind } from "./guidelines-loader";

const REPO_TEMPLATES_BASE = "https://github.com/alecs5am/ralphy/tree/main/templates";

export function listShowcaseSlugs(): string[] {
  return clips.map((c) => c.id);
}

export function findShowcaseClip(slug: string): Clip | undefined {
  return clips.find((c) => c.id === slug);
}

/** Map clip span → CSS aspect-ratio (W / H). */
const SPAN_ASPECT: Record<Clip["span"], string> = {
  v1: "9 / 16",
  v2: "9 / 16",
  sq: "1 / 1",
  h2: "16 / 9",
  h3: "16 / 9",
};

/** Map the visible "label" on each clip → broad tag set so the filter chips
 * surface useful groupings without per-clip JSON authoring. Keys here become
 * lowercase library tags. */
const LABEL_TAGS: Record<string, string[]> = {
  "Photoreal":         ["photoreal", "humans"],
  "Product Ad":        ["product", "commercial"],
  "Analog Horror":     ["horror", "analog"],
  "Hyper Motion":      ["product", "hypermotion"],
  "UGC Selfie":        ["ugc", "selfie", "humans"],
  "Horror Short":      ["horror", "narrative"],
  "Anthropomorphic":   ["anthropomorphic", "anime", "narrative"],
  "Pixel Art":         ["pixel-art", "retro"],
  "Broadcast":         ["broadcast", "sports"],
  "Cinematic":         ["cinematic", "narrative"],
  "Comic":             ["comic", "narrative", "stylized"],
};

export function loadShowcaseClips(): GuidelineMeta[] {
  return clips.map((clip) => {
    const aspect = SPAN_ASPECT[clip.span];
    const tag = `@template:${clip.id}`;
    const tags = LABEL_TAGS[clip.label] ?? [clip.label.toLowerCase().replace(/\s+/g, "-")];
    const kind: LibraryKind = "recreate-video";
    return {
      slug: clip.id,
      name: clip.title,
      tag,
      kind,
      tagline: `${clip.label} — full vibe-reference. Remix end-to-end with your own brief.`,
      description: undefined,
      models: [],
      tags,
      version: undefined,
      cover: {
        src: clip.src,
        kind: "video",
        poster: clip.poster,
        alt: clip.title,
        aspect,
      },
      patterns: [],
      sourcePath: REPO_TEMPLATES_BASE,
      cta: {
        label: "Remix in Ralphy",
        tag,
        hintCmd: `ralphy template use ${clip.id}`,
      },
      href: { kind: "internal", url: `/library/${clip.id}` },
    };
  });
}

/** Build a synthetic GuidelineFull-like record for a showcase clip so the
 *  detail page (`/library/[slug]`) can render it without an on-disk
 *  `guidelines/<slug>/` folder. */
export function showcaseClipAsFull(slug: string): GuidelineFull | null {
  const all = clips.find((c) => c.id === slug);
  if (!all) return null;
  const tag = `@template:${slug}`;
  const tags = LABEL_TAGS[all.label] ?? [all.label.toLowerCase().replace(/\s+/g, "-")];
  return {
    slug,
    name: all.title,
    tag,
    kind: "recreate-video",
    tagline: `${all.label} — full vibe-reference. Remix end-to-end with your own brief.`,
    description: undefined,
    models: [],
    tags,
    version: undefined,
    cover: {
      src: all.src,
      kind: "video",
      poster: all.poster,
      alt: all.title,
      aspect: SPAN_ASPECT[all.span],
    },
    patterns: [],
    sourcePath: REPO_TEMPLATES_BASE,
    cta: { label: "Remix in Ralphy", tag, hintCmd: `ralphy template use ${slug}` },
    href: { kind: "internal", url: `/library/${slug}` },
    body: "",
    examples: [],
  };
}
