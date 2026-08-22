/* The vocabulary the eleven workspace-overview sections share: every section is one widget on
   the desk's 12-column row, every section states the same heading shape, and every claim Core
   cannot back draws the same honest plate. One string per role, stated once, so Performance,
   Planning, Insights and Operations cannot drift apart.
   Surface and ink always travel as a pair: a section names `bg-surface` together with the ink
   that surface pairs with, and the black overview header names `bg-instrument` with the
   on-instrument family. The action bases below carry geometry and behaviour only — each caller
   states its own surface and the ink that goes with it. */

/* A section spans the whole desk row; the half-width form splits once the desk is wide enough
   for two readable columns. The grid is the desk's own, so the sidebar or the chat rail taking
   width re-flows it with no viewport breakpoint. */
export const SECTION = "workspace-overview-section col-span-12 min-w-0 rounded-panel bg-surface p-4 text-ink";
export const SECTION_HALF = `${SECTION} @min-workspace-section/instrument-desk:col-span-6`;

/* A heading is the section title and, at its baseline, what the title is counted over. */
export const SECTION_HEADING = "workspace-section-heading mb-3 flex items-baseline justify-between gap-4";
export const SECTION_TITLE = "m-0 type-lg font-semibold text-ink";
export const SECTION_META = "font-code type-xs text-muted";
/* A block heading inside a section, and inside a drawer cell. */
export const BLOCK_TITLE = "m-0 type-base font-normal text-ink";

/* The plate a row draws when it has no contract behind it. Geometry is shared; the surface and
   its paired ink are stated once per plate, so a plate never inherits half a pair. */
const PLATE_BASE = "workspace-unavailable rounded-cell px-3 py-2";
export const PLATE = `${PLATE_BASE} bg-surface-sunken text-muted`;
export const PLATE_ON_SUNKEN = `${PLATE_BASE} bg-surface text-muted`;
export const PLATE_TITLE = "type-sm font-normal";
export const PLATE_COPY = "m-0 mt-1 type-xs leading-5";

/* Geometry, type and behaviour only. The caller appends a surface and its paired ink. */
const ACTION = "inline-flex flex-none items-center justify-center gap-2 rounded-control px-3 py-2 type-base";
export const ACTION_ON_SURFACE = `${ACTION} bg-surface text-ink`;
export const ACTION_ON_SUNKEN = `${ACTION} bg-surface-sunken text-ink`;
/* The quiet form: a row action that reads as a link until it is hovered. */
export const ACTION_QUIET = `${ACTION} bg-surface text-muted hover:bg-surface-sunken`;

/* A row inside a section. The base carries the cell surface and its geometry; the caller adds
   the column template it needs, because a row is either copy-plus-action or glyph-plus-copy.
   Gaps are stated by the caller too, so no row ever names `gap` twice. */
export const ROW = "grid min-w-0 items-center rounded-control bg-surface-sunken p-3";
/* Copy plus one action, and the same row with a leading glyph on a narrow content row. */
export const ROW_SPLIT = "grid-cols-(--workspace-row-columns) gap-x-4 gap-y-2";
export const ROW_THREE = "grid-cols-(--workspace-attention-columns) gap-3 @max-workspace-row/main-region:grid-cols-(--workspace-glyph-columns)";
/* An action that has to leave the row's last column once the row narrows. */
export const ROW_ACTION_STACKED = "@max-workspace-row/main-region:col-span-full @max-workspace-row/main-region:justify-self-start";

/* The 48px identity square in front of a Unit, an outcome or a project. */
export const GLYPH = "workspace-unit-glyph grid size-12 flex-none place-items-center rounded-field bg-surface-sunken text-muted";
export const GLYPH_MARK = "size-5";

/* Copy stacked in the middle column of a row. */
export const ROW_COPY = "grid min-w-0 gap-1";
export const ROW_TITLE = "type-sm font-normal text-ink";
export const ROW_NOTE = "type-xs leading-copy text-muted";

/* The detail drawer. It is portalled to the document body, outside the work-mode scope, so it
   states the theme's own surfaces and ink rather than inheriting them: the legacy ink at the
   document root is the on-dark family, which is invisible on a light widget. For the same
   reason its controls take the theme-ink ring, not the on-instrument one — they stand on the
   drawer's own light surface. */
export const DRAWER_CELL = "account-detail-section rounded-cell bg-surface-sunken px-0 py-5";
export const DRAWER_CELL_TITLE = "m-0 mb-3 type-base font-normal text-ink";
export const DRAWER_CELL_COPY = "m-0 mt-2 type-xs leading-copy text-muted";
export const DRAWER_FOOTER_ROW = "flex items-center gap-3";
export const DRAWER_FOOTER_NOTE = "type-xs leading-footnote text-muted";
export const DRAWER_ACTION = "command-button inline-flex min-h-7.5 min-w-35 flex-none items-center justify-center gap-2 rounded-control bg-surface px-3 type-sm text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const DRAWER_GLYPH = "size-4";
