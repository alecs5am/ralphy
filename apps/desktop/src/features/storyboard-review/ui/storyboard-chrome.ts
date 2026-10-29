/* The storyboard gallery's vocabulary: the card, its facts and its state badge, stated once. */

export const GALLERY = "storyboard-gallery flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden";
export const GALLERY_HEAD = "storyboard-head flex flex-none flex-wrap items-center gap-3 px-1";
export const GALLERY_TITLE = "m-0 type-lg text-ink";
export const GALLERY_SUMMARY = "type-sm text-muted";
export const GALLERY_GRID = "storyboard-grid grid min-h-0 flex-1 grid-cols-(--storyboard-grid-columns) content-start gap-3 overflow-y-auto overscroll-contain pb-6";
export const GALLERY_NOTE = "type-sm text-muted";
export const GALLERY_ERROR = "type-sm text-danger";

export const CARD = "storyboard-card flex min-w-0 flex-col overflow-hidden rounded-frame bg-card text-ink";
export const CARD_FRAME = "storyboard-frame relative w-full overflow-hidden bg-frame";
export const CARD_BODY = "flex flex-col gap-2 p-3";
export const CARD_HEAD = "flex items-center justify-between gap-2";
export const CARD_ID = "font-code type-mono-sm text-ink";
export const CARD_VO = "m-0 type-sm text-ink italic";
export const CARD_FACTS = "m-0 grid grid-cols-(--project-glyph-row-columns) gap-x-3 gap-y-0.5 type-xs";
export const CARD_FACT_LABEL = "text-muted";
export const CARD_FACT_VALUE = "m-0 min-w-0 break-words text-ink";
export const CARD_COMMENTS = "m-0 flex list-none flex-col gap-1 p-0 type-xs text-muted";
export const CARD_ACTIONS = "flex flex-wrap items-center gap-2";
export const CARD_FIELD = "min-h-16 w-full resize-y rounded-field bg-surface-sunken p-2 type-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

export const STATE_BADGE = "storyboard-state inline-flex h-control-sm flex-none items-center rounded-control px-2 type-xs";
/* Each state is a surface and the ink that stands on it, chosen together. */
export const STATE_SKIN = {
  pending: "bg-surface-sunken text-muted",
  approved: "bg-selected text-selected-ink",
  rejected: "bg-alert text-alert-ink",
  stale: "bg-chip text-ink",
} as const;
