/* The vocabulary five screens across four areas share, and which therefore had no single owner
   in the stylesheet: the plate a route draws while it is loading, broken, unavailable or empty,
   and the command control inside it. One constant is the same decision the sheet made, stated
   once where the markup can read it.

   Two skins, not one. The plate stands on the desk and on the media viewer's inspector, which
   are theme surfaces, and also on the viewer's stage and the chat rail, which are black widgets
   in both themes. A caller takes the pair its context needs; it never repaints half of one. That
   is not hypothetical: measured in the running renderer, the sheet's single `--fg-3` ink drew
   #A4A4A0 on the light theme's #F1F2F6 inspector at 2.24:1, because the viewer is portalled
   outside `.app-mode-work` and the legacy token fell back to the on-dark family there.

   The parts are exported separately because three call sites state their own padding or their own
   type step; composing from the parts is how they avoid carrying two utilities of one property. */

/* --- the command control ------------------------------------------------------------------ */

/* Geometry and behaviour only: no surface, no ink, no ring colour a caller might replace. */
const SHAPE = "inline-flex flex-none items-center justify-center gap-2 rounded-control px-3 type-sm focus-visible:outline-2 focus-visible:-outline-offset-2";
export const COMMAND_SHAPE = `${SHAPE} min-h-control-md`;
/* On the desk and on a light widget: the theme's raised control, the theme's ink, and a hover
   that carries its ink with it (#141414 on #D3D6DD light, #F2F2F0 on #242422 dark). */
export const COMMAND_SKIN = "bg-surface-hover text-ink hover:bg-desk-hover focus-visible:outline-ink";
/* On a black widget in both themes: the raised instrument plate, the on-dark ink, the ghost
   hover, and the on-instrument ring — `outline-ink` is #141414 on #1E1E1E in the light theme. */
export const COMMAND_SKIN_ON_INSTRUMENT = "bg-instrument-raised text-on-instrument hover:bg-ghost-hover focus-visible:outline-focus-on-instrument";
export const COMMAND_BUTTON = `command-button ${COMMAND_SHAPE} ${COMMAND_SKIN}`;
export const COMMAND_BUTTON_ON_INSTRUMENT = `command-button ${COMMAND_SHAPE} ${COMMAND_SKIN_ON_INSTRUMENT}`;
/* One step down, for the revision actions inside a composition detail. */
export const COMMAND_BUTTON_SM = `command-button ${SHAPE} min-h-control-sm ${COMMAND_SKIN}`;

/* --- the state plate ---------------------------------------------------------------------- */

export const STATE_BOX = "flex items-center justify-center gap-2.5";
export const STATE_PAD = "min-h-24 px-2 py-6";
export const STATE_INK = "type-sm text-muted";
export const STATE_INK_ON_INSTRUMENT = "type-sm text-on-instrument-muted";
/* An error or an unavailable state stacks its lines and centres them; a skeleton or an empty
   state is one line. */
export const STATE_COLUMN = "flex-col text-center";

export const PROJECT_SKELETON = `project-skeleton ${STATE_BOX} ${STATE_PAD} ${STATE_INK}`;
export const EMPTY_SECTION = `empty-section ${STATE_BOX} ${STATE_PAD} ${STATE_INK}`;
export const PROJECT_LOCAL_ERROR = `project-local-error ${STATE_BOX} ${STATE_PAD} ${STATE_COLUMN} ${STATE_INK}`;
export const PROJECT_LOCAL_ERROR_ON_INSTRUMENT = `project-local-error ${STATE_BOX} ${STATE_PAD} ${STATE_COLUMN} ${STATE_INK_ON_INSTRUMENT}`;
/* The media route's inline error band: the same plate without the 96px floor, which those two
   rows already decline with a `min-h-9` of their own. */
export const PROJECT_LOCAL_ERROR_ROW = `project-local-error ${STATE_BOX} px-2 py-6 ${STATE_COLUMN} ${STATE_INK}`;
