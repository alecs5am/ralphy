// landing/lib/library-index-types.ts
//
// Pure types for the unified, format-organized library index (issue 054).
// Kept fs-free so the client `LibraryListing` can import these without
// dragging node:fs into the browser bundle. The build-time index itself is
// assembled in `library-index.ts` (server-only) and handed to the client as
// plain JSON via the page's props.

export type LibraryFormat =
  | "video"
  | "image"
  | "carousel"
  | "fb-creative"
  | "motion-design"
  | "poster"
  | "sticker-pack";

/** All formats in display order. Formats with zero items still render in the
 * format nav (count 0) so the taxonomy is discoverable; selecting an empty one
 * shows the "no matches" state. The order is the FORMATS.md table order. */
export const LIBRARY_FORMATS: LibraryFormat[] = [
  "video",
  "image",
  "carousel",
  "fb-creative",
  "motion-design",
  "poster",
  "sticker-pack",
];

export const FORMAT_LABELS: Record<LibraryFormat, string> = {
  video: "Video",
  image: "Image",
  carousel: "Carousel",
  "fb-creative": "FB creative",
  "motion-design": "Motion design",
  poster: "Poster",
  "sticker-pack": "Sticker pack",
};

/** One-line definition surfaced under each format header (from FORMATS.md). */
export const FORMAT_BLURBS: Record<LibraryFormat, string> = {
  video: "Short- or long-form moving-image content — generated footage cut and composed into a clip.",
  image: "A single generated still that is the deliverable on its own.",
  carousel: "A multi-slide swipeable post where each slide is its own still.",
  "fb-creative": "A Facebook / Meta ad creative tuned for the ads manager.",
  "motion-design": "Code- and animation-driven motion graphics rather than camera footage.",
  poster: "A single high-impact key-art still — drop poster, flyer, hype graphic.",
  "sticker-pack": "A set of die-cut sticker images sharing one mascot or visual system.",
};

/** A flattened, build-time-computed library item. One per template / guideline
 * / showcase clip. `text` is the precomputed lowercase search haystack so the
 * client filter never has to re-join fields per keystroke at 10k+ scale. */
export interface LibraryItem {
  /** Stable key across the whole index (`source:slug`, source disambiguates a
   * guideline and a template that happen to share a slug). */
  key: string;
  slug: string;
  source: "template" | "guideline" | "showcase";
  name: string;
  /** Media-format axis (issue 052). Items with no declared format land in a
   * synthetic "video" bucket only if they are clearly video; otherwise stay
   * `undefined` and surface only in the "All" view. */
  format?: LibraryFormat;
  /** Slug of the general template this one specializes (same format). */
  styleOf?: string;
  /** True when this is the format's general baseline (no `styleOf`, source is a
   * template, and it is the canonical how-to for its format). */
  isGeneral: boolean;
  tagline?: string;
  tags: string[];
  models: string[];
  category?: string;
  /** The reproduce tag the user copies (e.g. `@template:<slug>`). */
  tag: string;
  /** The exact CLI command the agent runs for this item. */
  cliCmd: string;
  cover?: {
    src: string;
    kind: "image" | "video";
    poster?: string;
    alt: string;
    aspect: string;
  };
  href: { kind: "internal" | "external"; url: string };
  /** Precomputed lowercase search haystack. */
  text: string;
}

/** Shape the page hands the client. Counts are computed server-side so the
 * format nav can render with numbers before the (large) item list hydrates. */
export interface LibraryIndex {
  items: LibraryItem[];
  formatCounts: Record<string, number>;
  total: number;
}
