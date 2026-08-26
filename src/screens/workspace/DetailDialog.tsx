import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import type { InstrumentOverlayId } from "../../instrument/overlay-registry";
import { WINDOW, WINDOW_BODY, WINDOW_TITLEBAR, WindowClose } from "../../components/ui/Window";

type DetailOverlayId = Extract<InstrumentOverlayId,
  "workspace-account-detail" | "workspace-unit-outcome-detail" | "workspace-evidence-detail">;

/**
 * The workspace detail modal: a titled window standing over the overview, closing from its own
 * titlebar. It used to slide in against the right edge, which is the one shape the app no longer
 * has -- a detail is a modal like every other one. The three overview details differ only in what
 * they list, so the chrome — portal, backdrop, registry marker, heading, close — lives here once.
 */
export function DetailDialog({ id, open, title, description, closeLabel, className, footer, children, onOpenChange }: {
  id: DetailOverlayId;
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  closeLabel: string;
  className?: string;
  footer?: ReactNode;
  children: ReactNode;
  onOpenChange(open: boolean): void;
}) {
  const surface = `account-detail-dialog fixed inset-0 z-scrim-content m-auto h-workspace-detail-height w-workspace-drawer text-ink outline-none ${WINDOW}`;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      {/* The scrim's own fill is stated once, by the shell, for every instrument overlay. */}
      <Dialog.Overlay forceMount className="account-detail-overlay fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content
        forceMount
        className={className ? `${surface} ${className}` : surface}
        data-instrument-overlay={id}
      >
        {/* One line on the panel: what this is, then what kind of thing it is, then the close. */}
        <header className={`account-detail-header ${WINDOW_TITLEBAR}`}>
          <Dialog.Title className="m-0 min-w-0 flex-none truncate type-lg font-normal text-ink">{title}</Dialog.Title>
          <Dialog.Description className="m-0 min-w-0 flex-1 truncate type-xs capitalize text-muted">{description}</Dialog.Description>
          <Dialog.Close asChild><WindowClose label={closeLabel} /></Dialog.Close>
        </header>
        <div className={`account-detail-body ${WINDOW_BODY}`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">{children}</div>
          {footer && <><i className="mx-4 h-px flex-none bg-divider" aria-hidden="true" /><footer className="account-detail-footer grid flex-none gap-3 p-4">{footer}</footer></>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
