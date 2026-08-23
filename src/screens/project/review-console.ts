/* The media review console's vocabulary.

   Two components render these eight elements -- `MediaReviewConsole` (read-only, production) and
   `MockMediaReviewConsole` (the UX Testing Lab) -- and no stylesheet in the repository ever
   carried a rule for any of them. The production console inherited a correct on-dark ink from its
   root and was readable, but it had no layout at all: the header, the copy column, the three
   verdict buttons with their keycaps, the help paragraph and the footer were unstyled flow
   content. This module is that layout, stated once for both renderers.

   Both consoles stand in the instrument's right rail, which is a black widget in both themes, so
   every pair here is the on-dark family. `bg-surface text-ink` would be #141414 on #141414. */

/* The plate: a panel is R24. The column fits the rail rather than scrolling -- the preview is the
   one child that grows, so the scroller below is only the floor's safety valve. */
export const CONSOLE = "review-console flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-panel bg-instrument p-3 text-on-instrument";

/* The header: a mono eyebrow that says what kind of session this is, and one glyph that opens the
   selection in the viewer. The eyebrow is informational, so it takes the readable muted ink --
   never `--instrument-text-on-dark-muted-decorative`, which clears 4.5:1 against nothing. */
export const HEADER = "review-console-header flex flex-none items-center justify-between gap-2";
export const HEADER_LABEL = "min-w-0 truncate font-code type-mono-md tracking-block text-on-instrument-muted uppercase";
/* A ghost glyph on a black widget: raised plate, on-dark ink, ghost hover, on-instrument ring. */
export const GLYPH_ACTION = "inline-grid size-control-sm flex-none place-items-center rounded-control bg-instrument-raised text-on-instrument-muted hover:bg-ghost-hover hover:text-on-instrument focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument [&_svg]:size-3.5";

/* The preview: a cell is R14, and it is the one child that flexes. `MediaCardPreview` with `fill`
   states no aspect ratio of its own, so the preview needs a height from somewhere -- measured, an
   `aspect-square` took 601 of the console's 559 visible pixels and pushed the copy, the three
   verdicts, the help line and the navigation out of view, because the rail is shared with the
   chat panel and gives the console roughly 559px, not the whole column. Growing into whatever
   the other rows leave, over a floor, keeps every control on screen at every rail height. */
export const PREVIEW_BUTTON = "review-console-preview-button grid min-h-32 w-full flex-1 place-items-center overflow-hidden rounded-cell bg-instrument-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument";
export const PREVIEW = "review-console-preview size-full";

/* The copy column: a status pill, the name, and one line of provenance. */
export const COPY = "review-console-copy flex min-w-0 flex-none flex-col items-start gap-1";
export const NAME = "min-w-0 max-w-full truncate type-md font-normal text-on-instrument";
export const META = "min-w-0 max-w-full truncate font-code type-mono-sm tracking-label text-on-instrument-muted uppercase";
/* The status pill and its dot. A dot carries no copy, so the alarm tone is allowed there and only
   there: the pill's own label stays monochrome. */
export const STATUS = "media-review-status inline-flex min-h-control-sm max-w-full flex-none items-center gap-1.5 rounded-control bg-instrument-raised px-2 font-code type-mono-sm tracking-label text-on-instrument uppercase";
export const STATUS_DOT = "size-1.5 flex-none rounded-control";

export function statusDotTone(value: string): string {
  if (value === "approved") return "bg-on-instrument";
  if (value === "rejected") return "bg-alert-bright";
  if (value === "candidate" || value === "working" || value === "needs-work") return "bg-on-instrument-muted";
  return "bg-unreviewed";
}

/* The three verdicts, stacked: the rail is 292px at its minimum, and three pills in a row cannot
   hold "Needs Work" and its keycap. A control is R999. */
export const ACTIONS = "review-console-actions grid flex-none gap-1.5";
const VERDICT = "group flex min-h-control-lg items-center justify-between gap-2 rounded-control px-3 type-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument";
export const VERDICT_REST = `${VERDICT} bg-instrument-raised text-on-instrument hover:bg-ghost-hover`;
/* A primary action is the inversion of its context, and the context is a black widget. */
export const VERDICT_ACTIVE = `${VERDICT} bg-on-instrument text-instrument`;
/* Production has no contract to review against, so the row is a disabled control: the decorative
   ink is exactly what that tone is for, and the row carries `aria-disabled` so it reads as one. */
export const VERDICT_UNSUPPORTED = `${VERDICT} bg-instrument-raised text-on-instrument-muted-decorative`;
/* A keycap is R5, and it takes its own pair on every row state -- on the inverted row the plate is
   light, so a ghost keycap with muted ink would be light on light. */
export const KEYCAP = "inline-grid min-w-4.5 flex-none place-items-center rounded-key bg-ghost px-1 font-code type-mono-xs text-on-instrument-muted group-aria-pressed:bg-instrument group-aria-pressed:text-on-instrument group-aria-disabled:text-on-instrument-muted-decorative";

export const HELP = "review-console-help m-0 flex-none type-xs leading-copy text-on-instrument-muted";
/* Returned feedback is quoted copy, so it reads on its own plate rather than as another label. */
export const FEEDBACK = "review-console-feedback m-0 flex-none rounded-cell bg-instrument-raised p-2.5 type-sm leading-copy text-on-instrument-muted";

export const NAVIGATION = "review-console-navigation flex flex-none items-center justify-between gap-2";
export const NAV_ACTION = `${GLYPH_ACTION} disabled:text-on-instrument-muted-decorative disabled:hover:bg-instrument-raised`;
export const POSITION = "font-code type-mono-sm tracking-label text-on-instrument-muted";
