import { MODAL_ACTION_GHOST, MODAL_ACTION_PRIMARY } from "./Modal";

/**
 * Chrome the Calendar and the Memory rulebook share.
 *
 * Both routes stand one black widget on the light desk and hang the same vocabulary off it: an
 * action pill, a quiet text button, a portalled dialog, a state plate and a status dot. Stating
 * each string once here is what keeps the two routes from drifting apart.
 *
 * Per one-property-one-utility a base carries geometry, focus and behaviour only -- never a
 * surface or an ink a caller might replace, and never a height a caller would have to override.
 * Surface and ink travel as one pair inside one string, because a half-override is what paints
 * invisible ink.
 */

/** Shape, focus and motion of every action pill in both routes. No size, no type, no colour. */
export const ACTION = "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control transition-colors duration-fast ease-instrument motion-reduce:transition-none motion-reduce:duration-0";

/**
 * ...standing on a BLACK widget. The ink is the on-instrument family in both themes and the ring
 * is the on-dark one, because the theme ink is black on black in the light theme; the ghost hover
 * surface is theme-invariant by design.
 */
const ON_INSTRUMENT = "bg-instrument-raised text-on-instrument-muted hover:bg-ghost hover:text-on-instrument focus-visible:outline-focus-on-instrument";
/** ...and the one primary action on that widget, which inverts to the light plate. */
const ON_INSTRUMENT_PRIMARY = "bg-brand text-brand-ink hover:opacity-88 focus-visible:outline-focus-on-instrument";

export const INSTRUMENT_ACTION = `${ACTION} h-8 px-2.5 type-sm ${ON_INSTRUMENT}`;
export const INSTRUMENT_ACTION_PRIMARY = `${ACTION} h-8 px-2.5 type-sm ${ON_INSTRUMENT_PRIMARY}`;
/** The Memory topbar sits in a mono caps row, so its actions state their own case and type. */
export const INSTRUMENT_ACTION_COMPACT = `${ACTION} h-8 px-2.5 type-xs normal-case tracking-normal ${ON_INSTRUMENT}`;
export const INSTRUMENT_ACTION_PRIMARY_COMPACT = `${ACTION} h-8 px-2.5 type-xs normal-case tracking-normal ${ON_INSTRUMENT_PRIMARY}`;

/** A square icon control on a black widget. */
export const INSTRUMENT_ICON = `grid size-7 shrink-0 place-items-center rounded-control transition-colors duration-fast ease-instrument ${ON_INSTRUMENT} motion-reduce:transition-none motion-reduce:duration-0`;

/** A segmented tab on a black widget: geometry only, the caller states its own pair. */
export const INSTRUMENT_TAB = `${ACTION} h-8 px-2.5 type-sm focus-visible:outline-focus-on-instrument`;

/** A text-only button: no surface, so no corner to round and no hover plate. */
export const QUIET_TEXT = "shrink-0 px-1 type-label text-muted transition-colors duration-fast ease-instrument hover:text-ink motion-reduce:transition-none motion-reduce:duration-0";

/**
 * A control on a portalled surface. Everything these routes open is portalled to the document
 * body, outside `.app-mode-work`, where the legacy `--fg*` family resolves to the on-dark ink --
 * so the ring reset.css paints is near-white on a light dialog. Every control on an overlay
 * states the theme ring itself, and every label wrapping a field does too, because reset.css
 * draws that one on the label.
 */
export const OVERLAY_RING = "focus-visible:outline-ink";
export const OVERLAY_FIELD_RING = "focus-within:outline-ink";

/**
 * A dialog footer action, and the primary one. Both are the window kit's -- a modal action is the
 * same control wherever the modal is, and these two names are what the Calendar and Memory call
 * sites already read.
 */
export const OVERLAY_ACTION = MODAL_ACTION_GHOST;
export const OVERLAY_ACTION_PRIMARY = MODAL_ACTION_PRIMARY;

/**
 * The scrim under a portalled dialog. It states no fill: `[data-instrument-overlay-backdrop]` in
 * work-surfaces.css owns that for every instrument overlay, and an !important utility here would
 * beat the one decision every overlay shares.
 */
export const OVERLAY_SCRIM = "fixed inset-0 z-scrim";

/** A 6px status dot. Decorative: it never carries the only signal, only the tone of one. */
export const DOT = "block size-1.5 flex-none rounded-full";

/**
 * The tone of that dot, paired to the surface it stands on. `failed` takes the one alarm tone the
 * design allows and carries no text; every other state is a step of the monochrome ink, and the
 * copy beside it always says the same thing in words.
 */
export function dotTone(status: string, onInstrument = false): string {
  if (status === "failed") return "bg-alert";
  if (status === "published") return onInstrument ? "bg-on-instrument" : "bg-ink";
  return onInstrument ? "bg-on-instrument-muted" : "bg-muted";
}

/**
 * A 20px check box. On a light row the checked plate is the inverted desk plate; on a black row it
 * has to be the on-instrument plate, because the desk plate is black on black in the light theme.
 */
export const CHECK_BOX = "grid size-5 flex-none place-items-center rounded-field";
export const CHECK_MARK_ON_SURFACE = "text-desk-primary-ink";
export const CHECK_MARK_ON_INSTRUMENT = "text-instrument";

/** An empty, loading or error plate: one centred column of copy, never a drawn control. */
export const STATE_PLATE = "flex min-h-30 flex-1 flex-col items-center justify-center gap-1.75 text-center type-sm text-muted";
/** ...and its one-line form, which reads as a row. */
export const STATE_LINE = "flex min-h-30 flex-1 items-center justify-center gap-1.75 type-sm text-muted";

/** A mono block label over a metadata section. */
export const BLOCK_LABEL = "font-code type-mono-md tracking-block text-muted";
