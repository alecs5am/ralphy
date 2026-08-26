import * as Dialog from "@radix-ui/react-dialog";
import type { KeyboardEvent, ReactNode, Ref } from "react";

import type { InstrumentOverlayId } from "../../instrument/overlay-registry";
import { WINDOW, WINDOW_BODY, WINDOW_CARD, WINDOW_TITLEBAR, WindowClose } from "./Window";

/**
 * A modal: the app's window, centred over the one scrim every overlay shares.
 *
 * Every portalled dialog in the app used to spell this out -- root, portal, overlay with the
 * registry's backdrop marker, content with the registry's id, a titlebar, a close control of its
 * own invention, and a card. Seven copies of one shape drifted seven ways, which is how three of
 * them ended up with a close button that was neither round nor the same size. The shape lives here
 * now; a caller says what it is, how wide, and what is inside.
 *
 * The scrim's own fill belongs to `[data-instrument-overlay-backdrop]` in work-surfaces.css, so
 * this states no tone: one decision for every overlay in the app, modal or not.
 *
 * `size` is the caller's own width and height utilities -- a modal's measure is a property of what
 * it shows, not of being a modal. It has to state a height: `inset-0` is what centres the surface,
 * and top-and-bottom-0 stretches a dialog with no height to the whole window. `h-fit` is the
 * default, and it is in `size` rather than in the surface string on purpose -- two `height`
 * utilities on one element resolve by stylesheet order, not by the order they are written.
 *
 * Not every overlay is one of these. A panel with no Radix root (the calendar's two, the run
 * inspector) and the media viewer, whose surface is a `motion.section`, keep the `WINDOW*` strings
 * directly -- the chrome is still one decision, taken in Window.tsx.
 */
export interface ModalProps {
  /** The registry id, which is what marks the element as an instrument overlay. */
  id: InstrumentOverlayId;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Accessible name. Pass a node when the titlebar shows more than a string. */
  title: ReactNode;
  /** Accessible description. Give it `sr-only` in `descriptionClassName` when it is not shown. */
  description?: ReactNode;
  /**
   * Where the description reads. A dialog that explains itself in a sentence of instruction wants
   * that sentence at the top of the card with the work, not on the titlebar line -- and it may not
   * be duplicated, or a screen reader hears it twice.
   */
  descriptionPlacement?: "titlebar" | "body";
  closeLabel: string;
  /** Width and height utilities for the surface. Must state a height; defaults to `h-fit`. */
  size?: string;
  /** A mono caps label standing before the title. */
  eyebrow?: ReactNode;
  /** Titlebar controls, before the close. */
  actions?: ReactNode;
  /** A footer inside the card, under a rule. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A name for the titlebar, where a caller's own stylesheet or a geometry probe needs one. */
  titlebarClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  bodyClassName?: string;
  scrimClassName?: string;
  /** `raw` hands the body the card surface only, for a body that lays itself out (a grid). */
  card?: "column" | "raw";
  /** `data-*` attributes for the surface, for a caller whose state is part of its contract. */
  data?: Record<string, string>;
  /** Which stack this pair stands in. See `LAYERS`. */
  layer?: "scrim" | "modal" | "viewer";
  surfaceRef?: Ref<HTMLDivElement>;
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): void;
  onOpenAutoFocus?(event: Event): void;
  onCloseAutoFocus?(event: Event): void;
}

export const MODAL_SURFACE = `fixed inset-0 m-auto max-h-overlay-fit-block max-w-overlay-fit text-ink outline-none ${WINDOW}`;
export const MODAL_SCRIM = "fixed inset-0 animate-overlay-fade motion-reduce:animate-none";
/**
 * Which stack the pair stands in. The app has three, and they are not interchangeable: a dialog
 * stands over the desk and under the island, a viewer stands over everything including the island's
 * own layer, and the media modal sits between them. Stacking cannot be a class the caller adds --
 * two `z-index` utilities on one element resolve by stylesheet order, not by markup order.
 */
const LAYERS = {
  scrim: { scrim: "z-scrim", surface: "z-scrim-content" },
  modal: { scrim: "z-modal", surface: "z-modal-content" },
  viewer: { scrim: "z-viewer-backdrop", surface: "z-viewer-content" },
} as const;
/** The rule that separates a footer from the body it decides on. */
export const MODAL_RULE = "h-px flex-none bg-divider";

/**
 * The actions a modal offers, at one height.
 *
 * Five files had a private set of these -- `DIALOG_ACTION`, `DIALOG_GHOST`, `OVERLAY_ACTION`,
 * `FOOTER_BUTTON`, `SHELL_ACTION` -- with four different heights between them for the same row of
 * the same kind of window. Three tones: the quiet one, the one action the modal wants taken, and
 * the destructive one. Surface and ink always travel as a pair, because a half-override is what
 * paints invisible ink.
 */
export const MODAL_ACTION = "inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3.5 type-sm transition-colors duration-fast ease-instrument focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:duration-0";
export const MODAL_ACTION_GHOST = `${MODAL_ACTION} bg-surface-sunken text-ink hover:bg-surface-hover`;
export const MODAL_ACTION_PRIMARY = `${MODAL_ACTION} bg-brand text-brand-ink hover:opacity-88`;
export const MODAL_ACTION_DANGER = `${MODAL_ACTION} bg-alert text-alert-ink hover:bg-alert-bright`;

const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" ");

export function Modal({
  id, open, onOpenChange, title, description, closeLabel, size = "h-fit", eyebrow, actions, footer, children,
  className, titlebarClassName, titleClassName, descriptionClassName, bodyClassName, scrimClassName, card = "column", data,
  descriptionPlacement = "titlebar",
  surfaceRef, onKeyDown, onOpenAutoFocus, onCloseAutoFocus, layer = "scrim",
}: ModalProps) {
  const stack = LAYERS[layer];
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className={join(MODAL_SCRIM, stack.scrim, scrimClassName)} data-instrument-overlay-backdrop="" />
      <Dialog.Content
        forceMount
        ref={surfaceRef}
        className={join(MODAL_SURFACE, stack.surface, size, className)}
        data-instrument-overlay={id}
        {...data}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <header className={join(WINDOW_TITLEBAR, titlebarClassName)}>
          {eyebrow}
          <Dialog.Title className={titleClassName ?? "m-0 min-w-0 flex-none truncate type-lg font-normal text-ink"}>{title}</Dialog.Title>
          {descriptionPlacement === "titlebar" && <Dialog.Description className={descriptionClassName ?? "m-0 min-w-0 flex-1 truncate type-xs text-muted"}>{description}</Dialog.Description>}
          {actions}
          <Dialog.Close asChild><WindowClose label={closeLabel} /></Dialog.Close>
        </header>
        <div className={join(card === "raw" ? WINDOW_CARD : WINDOW_BODY, bodyClassName)}>
          {descriptionPlacement === "body" && <Dialog.Description className={descriptionClassName}>{description}</Dialog.Description>}
          {children}
          {footer && <><i className={`mx-4 ${MODAL_RULE}`} aria-hidden="true" /><footer className="flex flex-none items-center justify-end gap-2 p-4">{footer}</footer></>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
