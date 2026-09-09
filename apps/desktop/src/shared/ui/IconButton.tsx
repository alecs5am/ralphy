import type { ComponentPropsWithRef } from "react";

/**
 * A control that is nothing but a glyph.
 *
 * There were roughly fifteen of these written out by hand -- the month arrows, the preview's play
 * and mute, the search field's clear, the shell's back and forward, the caption's copy -- and they
 * had drifted in the way a copied string always does. Four of them carried no focus ring at all, so
 * they were unreachable by keyboard in any visible sense; the rest disagreed about the transition
 * and about what `disabled` looks like. Those three are not decisions a call site should be making
 * again, so they live here.
 *
 * Size, radius and tone are the caller's, and deliberately so: this control appears at seven sizes
 * between 4.25 and 7.5, on grounds from the desk to a black instrument plate, and a base that
 * guessed any of them would only be overridden. Two utilities setting one property resolve by
 * stylesheet order rather than markup order, so the base states no `display` beyond the grid it
 * needs to centre the glyph, no size, no radius, and no colour.
 */
export const ICON_BUTTON = "grid flex-none place-items-center transition-colors duration-fast ease-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none motion-reduce:duration-0";
/** The quiet one: muted at rest, ink under the cursor. The caller adds its own hover plate. */
export const ICON_BUTTON_QUIET = `${ICON_BUTTON} text-muted hover:text-ink`;

const join = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

/** A glyph button with an accessible name, which is the only name it can have. */
export function IconButton({ className, label, ...rest }: ComponentPropsWithRef<"button"> & { label: string }) {
  return <button className={join(ICON_BUTTON_QUIET, className)} type="button" aria-label={label} {...rest} />;
}
