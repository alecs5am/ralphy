// Shared overlay payload shapes for the library redesign.

/** Everything the Remix modal needs, precomputed by the caller so the modal
 *  is presentation-only (works for templates, guidelines, and individual
 *  gallery outputs alike). */
export interface RemixPayload {
  /** The reproduce tag the user copies (`@template:<slug>` / `@guideline:<slug>`). */
  tag: string;
  /** The CLI command shown as the alternative to the tag. */
  cli: string;
  /** Headline name (template name, or the output's label). */
  title: string;
  /** Eyebrow above the title ("Remix this template" / "Remix this output"). */
  eyebrow: string;
  /** "from <template name>" line, shown for an individual output. */
  from?: string;
  /** Optional "regenerate just this slot" command for an individual output. */
  slotCmd?: string;
  /** Thumbnail: media (image/video src) or a fallback format glyph. */
  thumb?: { kind: "image" | "video"; src: string } | { glyph: string };
  /** Free-text swap example folded into the closing hint. */
  swapHint?: string;
  /** Staged ingredient swaps from the unit-detail panel. When present the modal
   *  renders a "Your swaps" diff list and bakes `--set <axis>=<value>` flags
   *  into the CLI line (caller already appends them to `cli`). */
  swaps?: RemixSwap[];
}

/** One staged swap from the ingredient panel, shaped for the diff list. */
export interface RemixSwap {
  /** Human axis label ("Location", "Characters"). */
  axis: string;
  /** The block/asset being replaced (struck through in the diff). */
  fromName: string;
  /** What it's being replaced with — a block name, a described brief, or an upload. */
  toLabel: string;
}

/** One item in the shared fullscreen lightbox. */
export interface LightboxItem {
  src: string;
  kind: "image" | "video";
  label?: string;
  fmtLabel?: string;
  remix?: RemixPayload;
}

export interface LightboxState {
  items: LightboxItem[];
  index: number;
  checker?: boolean;
}
