// landing/lib/library-types.ts
//
// Pure types + small const maps for the library. Lives separate from
// guidelines-loader.ts (which imports node:fs) so client components can
// import these without dragging fs into the browser bundle.

export type LibraryKind = "image-prompt" | "recreate-video" | "oneshot-video";

export const KIND_LABELS: Record<LibraryKind, string> = {
  "image-prompt": "Image prompt",
  "recreate-video": "Video remix",
  "oneshot-video": "One-shot video",
};

export const KIND_GROUPS: Record<LibraryKind, "image" | "video"> = {
  "image-prompt": "image",
  "recreate-video": "video",
  "oneshot-video": "video",
};

export interface LibraryCta {
  label: string;
  tag: string;
  hintCmd: string;
}

export interface LibraryCover {
  src: string;
  kind: "image" | "video";
  poster?: string;
  alt: string;
  aspect: string;
}

export interface LibraryEntry {
  slug: string;
  name: string;
  tag: string;
  kind: LibraryKind;
  tagline?: string;
  description?: string;
  models: string[];
  tags: string[];
  version?: string;
  cover?: LibraryCover;
  patterns: string[];
  sourcePath: string;
  cta: LibraryCta;
  href: { kind: "internal" | "external"; url: string };
}
