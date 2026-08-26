import { X } from "lucide-react";
import type { ComponentPropsWithRef } from "react";

/**
 * The app's window chrome: a 2px run of panel around a card one radius step in, with the
 * titlebar standing on the panel itself rather than inside the card.
 *
 * The sidebar, the chat's utility panel, the view panel, the Context document, its reader, every
 * modal and the Unit cards are all this shape, and each of them used to spell it out. They are
 * the same object at different sizes, so the shape is named once here and every surface that is a
 * window reads the name -- a new one does not have to rediscover which radius pairs with which
 * ground.
 *
 * `motion.aside` and Radix's `Dialog.Content` cannot be these components, so the class strings
 * are exported too: pass `WINDOW` to the former, or hand `Dialog.Content` an `asChild` `Window`.
 */

export const WINDOW = "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-window bg-panel p-0.5";
/**
 * The titlebar is one line: what this is, what state it is in, and its actions.
 *
 * Order in markup decides which edge it stands on. A modal puts it above the card; a card that is
 * mostly picture -- a Unit tile -- puts it below, so the image starts at the top edge and the
 * identity reads as a caption. Nothing in the class changes between the two.
 */
export const WINDOW_TITLEBAR = "flex h-11 min-w-0 flex-none items-center gap-2.5 px-3";
/**
 * The card the content stands on. Everything that is not identity or an action belongs here.
 *
 * Three steps of the same surface. `WINDOW_PLATE` is the surface with no sizing at all, for a card
 * whose height comes from its own content -- a Unit tile's picture is an aspect ratio, and `flex-1`
 * would fight it. `WINDOW_CARD` fills the window, for a body that lays itself out: the media
 * viewer's stage and inspector are a grid, and a flex column imposed on them would be a lie the
 * layout has to undo. `WINDOW_BODY` is that card as a flex column, which is what most bodies want.
 */
export const WINDOW_PLATE = "overflow-hidden rounded-frame bg-card";
export const WINDOW_CARD = `min-h-0 min-w-0 flex-1 ${WINDOW_PLATE}`;
export const WINDOW_BODY = `flex flex-col ${WINDOW_CARD}`;
/**
 * The close control every window shares: a round plate on the titlebar that goes to the alarm
 * under the cursor. Closing is the one titlebar action that throws work away, so it is the one
 * that takes the alarm tone -- the same reason the traffic light on this platform is red there.
 */
export const WINDOW_CLOSE = "grid size-7.5 flex-none place-items-center rounded-full bg-chip text-muted transition-colors duration-fast ease-instrument hover:bg-alert hover:text-alert-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:duration-0";

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

/** The close button itself, for the callers that own their own button element. */
export function WindowClose({ className, label, ...rest }: ComponentPropsWithRef<"button"> & { label: string }) {
  return <button className={join(WINDOW_CLOSE, className)} type="button" aria-label={label} {...rest}>
    <X className="w-3.5" aria-hidden="true" />
  </button>;
}
