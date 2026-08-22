import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import type { InstrumentOverlayId } from "../../instrument/overlay-registry";

type DetailOverlayId = Extract<InstrumentOverlayId,
  "workspace-account-detail" | "workspace-unit-outcome-detail" | "workspace-evidence-detail">;

/**
 * The workspace detail drawer: a titled surface that slides in over the overview and closes
 * from its own header. The three overview details differ only in what they list, so the
 * chrome — portal, backdrop, registry marker, heading, close control — lives here once.
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
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="account-detail-overlay" data-instrument-overlay-backdrop="" />
      <Dialog.Content
        forceMount
        className={className ? `account-detail-dialog ${className}` : "account-detail-dialog"}
        data-instrument-overlay={id}
      >
        <header className="account-detail-header">
          <span>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </span>
          <Dialog.Close asChild>
            <button type="button" aria-label={closeLabel}><X aria-hidden="true" /></button>
          </Dialog.Close>
        </header>
        <div className="account-detail-body">{children}</div>
        {footer && <footer className="account-detail-footer">{footer}</footer>}
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
