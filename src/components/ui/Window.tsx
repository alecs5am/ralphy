import type { ComponentPropsWithRef } from "react";

/**
 * The app's window chrome: a 2px run of panel around a card one radius step in, with the
 * titlebar standing on the panel itself rather than inside the card.
 *
 * The sidebar, the chat's utility panel, the view panel, the Context document, its reader and the
 * Unit viewer are all this shape, and each of them used to spell it out. They are the same object
 * at different sizes, so the shape is named once here and every surface that is a window reads
 * the name -- a new one does not have to rediscover which radius pairs with which ground.
 *
 * `motion.aside` and Radix's `Dialog.Content` cannot be these components, so the class strings
 * are exported too: pass `WINDOW` to the former, or hand `Dialog.Content` an `asChild` `Window`.
 */

export const WINDOW = "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-window bg-panel p-0.5";
/** The titlebar is one line: what this is, what state it is in, and its actions. */
export const WINDOW_TITLEBAR = "flex h-11 min-w-0 flex-none items-center gap-2.5 px-3";
/**
 * The card the content stands on. Everything that is not identity or an action belongs here.
 *
 * `WINDOW_CARD` is the surface alone, for a body that lays itself out -- the media viewer's stage
 * and inspector are a grid, and a flex column imposed on them would be a lie the layout has to
 * undo. `WINDOW_BODY` is the same card as a flex column, which is what most bodies want.
 */
export const WINDOW_CARD = "min-h-0 min-w-0 flex-1 overflow-hidden rounded-frame bg-card";
export const WINDOW_BODY = `flex flex-col ${WINDOW_CARD}`;

const join = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export function Window({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return <div className={join(WINDOW, className)} {...rest} />;
}

export function WindowTitlebar({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return <div className={join(WINDOW_TITLEBAR, className)} {...rest} />;
}

export function WindowBody({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return <div className={join(WINDOW_BODY, className)} {...rest} />;
}
