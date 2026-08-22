import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import type { InstrumentOverlayId } from "../../instrument/overlay-registry";
import { DRAWER_GLYPH } from "./overview-chrome";

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
  const surface = "account-detail-dialog fixed inset-y-0 right-0 z-scrim-content flex w-workspace-drawer flex-col rounded-panel bg-surface text-ink outline-none";
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {open && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      {/* The scrim's own fill is stated once, by the shell, for every instrument overlay. */}
      <Dialog.Overlay forceMount className="account-detail-overlay fixed inset-0 z-scrim" data-instrument-overlay-backdrop="" />
      <Dialog.Content
        forceMount
        className={className ? `${surface} ${className}` : surface}
        data-instrument-overlay={id}
      >
        <header className="account-detail-header flex flex-none items-start justify-between gap-4 bg-surface-sunken p-4">
          <span className="flex min-w-0 flex-col gap-1">
            <Dialog.Title className="m-0 truncate type-lg font-normal text-ink">{title}</Dialog.Title>
            <Dialog.Description className="m-0 type-xs capitalize text-muted">{description}</Dialog.Description>
          </span>
          <Dialog.Close asChild>
            <button className="grid size-7.5 flex-none place-items-center rounded-control bg-transparent text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" aria-label={closeLabel}><X className={DRAWER_GLYPH} aria-hidden="true" /></button>
          </Dialog.Close>
        </header>
        <div className="account-detail-body min-h-0 flex-1 overflow-y-auto px-4 pt-0 pb-6">{children}</div>
        {footer && <footer className="account-detail-footer grid flex-none gap-3 bg-surface-sunken p-4">{footer}</footer>}
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
