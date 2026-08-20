import { cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode, type ReactPortal } from "react";
import { createPortal } from "react-dom";

type InstrumentOverlayKind = "dialog" | "drawer" | "viewer" | "listbox" | "popover" | "menu" | "sheet" | "rail";

export const INSTRUMENT_OVERLAYS = {
  "root-picker": { kind: "dialog" }, "migration-recovery": { kind: "dialog" }, "app-alert": { kind: "dialog" },
  "profile-menu": { kind: "menu" }, settings: { kind: "dialog" }, "shared-select-menu": { kind: "listbox" },
  "workspace-picker": { kind: "listbox" }, "agent-chat-recent-menu": { kind: "menu" }, "agent-chat-provider-menu": { kind: "menu" },
  "agent-chat-model-menu": { kind: "menu" }, "agent-chat-mode-menu": { kind: "menu" },
  "dynamic-island": { kind: "popover" }, "right-rail-sheet": { kind: "sheet" },
  "workspace-account-detail": { kind: "dialog" }, "workspace-unit-outcome-detail": { kind: "dialog" }, "workspace-evidence-detail": { kind: "dialog" },
  "shared-inspector": { kind: "rail" }, "shared-viewer": { kind: "viewer" }, "shared-workflow": { kind: "dialog" },
  "memory-recall": { kind: "dialog" }, "memory-editor": { kind: "dialog" }, "memory-history": { kind: "dialog" }, "memory-confirm": { kind: "dialog" },
  "calendar-filter": { kind: "popover" }, "calendar-drawer": { kind: "drawer" }, "calendar-inspector": { kind: "rail" }, "calendar-schedule": { kind: "dialog" },
  "calendar-unit-picker": { kind: "popover" }, "calendar-date-popover": { kind: "popover" }, "calendar-time-popover": { kind: "popover" },
  "calendar-platform-settings": { kind: "dialog" }, "calendar-account-detail": { kind: "dialog" }, "calendar-reconnect": { kind: "dialog" },
  "document-editor": { kind: "dialog" }, "document-viewer": { kind: "viewer" }, "document-conflict": { kind: "dialog" },
  "media-viewer": { kind: "viewer" }, "media-context-menu": { kind: "menu" }, "mock-needs-work": { kind: "dialog" },
  "unit-viewer": { kind: "viewer" }, "run-inspector": { kind: "rail" }, "marketplace-detail": { kind: "dialog" },
  "target-chooser": { kind: "dialog" }, terminal: { kind: "drawer" },
} as const satisfies Record<string, { kind: InstrumentOverlayKind }>;

export const SHARED_SELECT_OVERLAY_OWNERS = {
  "settings.appearance": { module: "src/screens/SettingsScreen.tsx", routeScope: { kind: "exact", routeKeys: ["settings.appearance"] } },
  "shared.toolbar": { module: "src/screens/shared-library/SharedLibraryToolbar.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.shared"] } },
  "shared.workflow": { module: "src/screens/shared-library/SharedLibraryWorkflows.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.shared"] } },
  "memory.editor": { module: "src/screens/MemoryScreen.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.memory"] } },
  "project.media": { module: "src/screens/project/MediaPanel.tsx", routeScope: { kind: "exact", routeKeys: ["project.media"] } },
  "project.activity": { module: "src/screens/project/ActivityTimeline.tsx", routeScope: { kind: "exact", routeKeys: ["project.activity"] } },
  "marketplace.header": { module: "src/screens/marketplace/MarketplaceHeader.tsx", routeScope: { kind: "production-prefix", prefix: "marketplace." } },
} as const;

export type InstrumentOverlayId = keyof typeof INSTRUMENT_OVERLAYS;
export type InstrumentSharedSelectOwnerId = keyof typeof SHARED_SELECT_OVERLAY_OWNERS;

export interface InstrumentOverlayProps<Id extends InstrumentOverlayId> {
  id: Id;
  open: boolean;
  label: string;
  description: string;
  opener: HTMLElement | null;
  onOpenChange(open: boolean): void;
  children: ReactNode;
  localScroll?: boolean;
  host?: "managed-portal" | "primitive-host";
  overlayOwner?: InstrumentSharedSelectOwnerId;
}

const overlayRoles: Record<InstrumentOverlayKind, "dialog" | "listbox" | "menu" | "complementary"> = {
  dialog: "dialog",
  drawer: "dialog",
  viewer: "dialog",
  listbox: "listbox",
  popover: "dialog",
  menu: "menu",
  sheet: "dialog",
  rail: "complementary",
};

function restoreFocus(opener: HTMLElement | null) {
  if (opener?.isConnected) opener.focus({ preventScroll: true });
}

function primitiveMarker<Id extends InstrumentOverlayId>(
  props: InstrumentOverlayProps<Id>,
): ReactElement {
  const marker = {
    "data-instrument-overlay": props.id,
    ...(props.id === "shared-select-menu" ? { "data-instrument-overlay-owner": props.overlayOwner } : {}),
  };
  if (isValidElement(props.children)) return cloneElement(props.children as ReactElement<Record<string, unknown>>, marker);
  return <div {...marker}>{props.children}</div>;
}

function ManagedOverlay<Id extends InstrumentOverlayId>(props: InstrumentOverlayProps<Id>): ReactPortal | ReactElement | null {
  const surface = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const { id, open, label, description, children, localScroll, onOpenChange, opener } = props;

  useEffect(() => {
    if (open) surface.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const content = <div
    ref={surface}
    role={overlayRoles[INSTRUMENT_OVERLAYS[id].kind]}
    tabIndex={-1}
    aria-label={label}
    aria-describedby={description ? descriptionId : undefined}
    data-instrument-overlay={id}
    data-instrument-local-scroll={localScroll || undefined}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      restoreFocus(opener);
    }}
  >
    {description && <span id={descriptionId} hidden>{description}</span>}
    {children}
  </div>;

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

export function InstrumentOverlay<Id extends InstrumentOverlayId>(props: InstrumentOverlayProps<Id>): ReactPortal | ReactElement | null {
  const { id, host = "managed-portal", overlayOwner } = props;
  if (id === "shared-select-menu" && !overlayOwner) throw new Error("shared-select-menu requires one registered overlay owner");
  if (id !== "shared-select-menu" && overlayOwner) throw new Error(`${id} only accepts an overlay owner for shared-select-menu`);
  if (host === "primitive-host") return props.open ? primitiveMarker(props) : null;
  return <ManagedOverlay {...props} />;
}
