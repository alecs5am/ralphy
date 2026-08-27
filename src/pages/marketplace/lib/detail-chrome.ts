/* The vocabulary the three Marketplace detail routes share: a model detail, a public item
   detail, and the unavailable-capability shell all draw the same back control, black hero,
   reading column and evidence rail. One string per role, stated once, so the model route and
   the template route cannot drift apart.
   Surface and ink always travel as a pair: the base action carries geometry, focus and
   behaviour only, and each caller names its own surface with the ink that surface pairs with.
   Ink on the hero is the on-instrument family in both themes, and every control standing on it
   carries the on-instrument ring, because the theme ink is black on black in the light theme. */

export const DETAIL_ROUTE = "flex min-w-0 flex-col gap-2 pt-4 pb-12";
export const DETAIL_STATE = "min-h-65 items-start justify-center";
export const DETAIL_BACK = "inline-flex h-8 w-fit items-center gap-1.75 rounded-field bg-surface px-2.75 type-sm text-ink";
export const DETAIL_HERO = "grid min-w-0 grid-cols-(--marketplace-hero-columns) gap-x-5 gap-y-2 rounded-widget bg-instrument p-5.5 text-on-instrument @max-marketplace-split/main-region:grid-cols-1";
export const DETAIL_EYEBROW = "col-span-full font-mono type-meta uppercase tracking-eyebrow text-on-instrument-muted";
export const DETAIL_TITLE = "m-0 min-w-0 type-display font-normal leading-hero wrap-anywhere";
export const DETAIL_LEAD = "m-0 min-w-0 type-sm leading-copy text-on-instrument-muted wrap-anywhere";
export const DETAIL_ACTIONS = "col-start-2 row-span-2 row-start-2 flex gap-2 self-center @max-marketplace-split/main-region:col-start-1 @max-marketplace-split/main-region:row-auto @max-marketplace-split/main-region:flex-wrap";
export const HERO_STATE = "col-span-full type-sm leading-copy text-on-instrument-muted";

const HERO_ACTION = "inline-flex min-h-8.5 items-center gap-1.75 rounded-control px-3 type-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-instrument";
/* The one primary action on a hero, and the disabled pair it falls back to. */
export const HERO_ACTION_PRIMARY = `${HERO_ACTION} bg-composer text-composer-ink aria-disabled:bg-instrument-raised aria-disabled:text-on-instrument-muted`;
export const HERO_ACTION_SECONDARY = `${HERO_ACTION} bg-instrument-raised text-on-instrument aria-disabled:text-on-instrument-muted`;
export const HERO_ACTION_GLYPH = "w-3.25";

export const DETAIL_LAYOUT = "grid min-w-0 grid-cols-(--marketplace-detail-columns) items-start gap-2 @max-marketplace-split/main-region:grid-cols-1";
export const DETAIL_COLUMN = "flex min-w-0 flex-col gap-2";
export const DETAIL_SECTION = "min-w-0 rounded-cell bg-surface p-4";
export const ASIDE_SECTION = "min-w-0 rounded-cell bg-surface-sunken p-4 text-ink";
export const DETAIL_HEADING = "m-0 mb-2.25 type-base font-normal";
export const DETAIL_SUBHEADING = "m-0 mt-3.5 mb-2.25 type-sm font-normal text-ink";
export const DETAIL_COPY = "type-sm leading-copy text-muted wrap-anywhere";
export const DETAIL_CODE = "font-mono wrap-anywhere";

/* The disabled-review block: a control plus the reason it is disabled. The hero form is the
   primary action on black; the plate form stands on a light widget. */
export const REVIEW_BLOCK = "marketplace-unavailable-review flex min-w-0 flex-col items-start gap-1.75";
export const REVIEW_REASON = "m-0 max-w-130 type-xs leading-copy text-muted";
export const REVIEW_ACTION_PLATE = "inline-flex min-h-8 items-center justify-center rounded-control bg-instrument px-3 type-sm text-on-instrument aria-disabled:bg-surface-sunken aria-disabled:text-muted";

/* A My Library route: a heading, a reason, and one plate that holds its height. */
export const LIBRARY_ROUTE = "grid min-h-65 min-w-0 content-start gap-2.5 pt-6 pb-12";
export const LIBRARY_TITLE = "m-0 mt-1 type-heading font-normal";
export const LIBRARY_COPY = "m-0 type-sm leading-copy text-muted";
export const LIBRARY_MONO = "font-mono type-meta not-italic text-muted wrap-anywhere";
/* The route that reports an unavailable library section is one plate, not a page. */
export const LIBRARY_UNAVAILABLE = "grid min-h-45 min-w-0 content-start gap-2.5 rounded-widget bg-surface p-5";
export const LIBRARY_PLATE = "min-h-45 rounded-widget bg-surface-sunken p-5";

