import type { ReactNode } from "react";

import type { InstrumentOverlayId } from "@/shared/instrument/overlay-registry";
import { Modal, MODAL_RULE } from "@/shared/ui/Modal";

type DetailOverlayId = Extract<InstrumentOverlayId,
  "workspace-account-detail" | "workspace-unit-outcome-detail" | "workspace-evidence-detail">;

/**
 * The workspace detail: a titled window standing over the overview. It used to slide in against
 * the right edge, which is the one shape the app no longer has -- a detail is a modal like every
 * other one. The three overview details differ only in what they list, so what stays here is the
 * measure, the scroller and the footer rule; the rest is `Modal`.
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
  return <Modal
    id={id}
    open={open}
    onOpenChange={onOpenChange}
    title={title}
    description={description}
    closeLabel={closeLabel}
    size="h-workspace-detail-height w-workspace-drawer"
    className={`account-detail-dialog${className ? ` ${className}` : ""}`}
    descriptionClassName="m-0 min-w-0 flex-1 truncate type-xs capitalize text-muted"
    titlebarClassName="account-detail-header"
    bodyClassName="account-detail-body"
  >
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">{children}</div>
    {footer && <><i className={`mx-4 ${MODAL_RULE}`} aria-hidden="true" /><footer className="account-detail-footer grid flex-none gap-3 p-4">{footer}</footer></>}
  </Modal>;
}
