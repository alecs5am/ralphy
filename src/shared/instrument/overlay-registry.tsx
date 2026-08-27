import * as Dialog from "@radix-ui/react-dialog";
import { cloneElement, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, type ReactElement, type ReactNode, type ReactPortal } from "react";
import { createPortal } from "react-dom";
import { WINDOW } from "../ui/Window";

type InstrumentOverlayKind = "dialog" | "viewer" | "listbox" | "popover" | "menu" | "sheet" | "rail";

export const INSTRUMENT_OVERLAYS = {
  "root-picker": { kind: "dialog" }, "migration-recovery": { kind: "dialog" }, "app-alert": { kind: "dialog" },
  "profile-menu": { kind: "menu" }, settings: { kind: "dialog" }, "shared-select-menu": { kind: "listbox" },
  "workspace-picker": { kind: "listbox" }, "agent-chat-recent-menu": { kind: "menu" }, "agent-chat-provider-menu": { kind: "menu" },
  "agent-chat-model-menu": { kind: "menu" }, "agent-chat-mode-menu": { kind: "menu" },
  "agent-chat-context": { kind: "menu" },
  "dynamic-island": { kind: "popover" }, "right-rail-sheet": { kind: "sheet" },
  "workspace-account-detail": { kind: "dialog" }, "workspace-unit-outcome-detail": { kind: "dialog" }, "workspace-evidence-detail": { kind: "dialog" },
  "shared-inspector": { kind: "rail" }, "shared-viewer": { kind: "viewer" }, "shared-workflow": { kind: "dialog" },
  "memory-recall": { kind: "dialog" }, "memory-editor": { kind: "dialog" }, "memory-history": { kind: "dialog" }, "memory-confirm": { kind: "dialog" },
  "calendar-filter": { kind: "popover" }, "calendar-drawer": { kind: "dialog" }, "calendar-inspector": { kind: "dialog" }, "calendar-schedule": { kind: "dialog" },
  "calendar-unit-picker": { kind: "popover" }, "calendar-date-popover": { kind: "popover" }, "calendar-time-popover": { kind: "popover" },
  "calendar-platform-settings": { kind: "dialog" }, "calendar-account-detail": { kind: "dialog" }, "calendar-reconnect": { kind: "dialog" },
  "document-editor": { kind: "dialog" }, "document-viewer": { kind: "viewer" }, "document-conflict": { kind: "dialog" },
  "media-viewer": { kind: "viewer" }, "media-context-menu": { kind: "menu" }, "mock-needs-work": { kind: "dialog" },
  "unit-viewer": { kind: "viewer" }, "run-inspector": { kind: "rail" }, "marketplace-detail": { kind: "dialog" },
  "target-chooser": { kind: "dialog" },
  /* Handoff 14's view panel. Both are menus, so both are non-modal: the type menu draws the
     design's page-local scrim itself, because the app's backdrop rule only fires for the modal
     kinds and a window-wide dim would be heavier than either menu is. */
  "view-panel-types": { kind: "menu" }, "view-panel-overflow": { kind: "menu" },
  /* A place the Context page listed, read on the page. A viewer rather than a
     dialog: it holds a file's text and closes without deciding anything. */
  "context-reader": { kind: "viewer" },
} as const satisfies Record<string, { kind: InstrumentOverlayKind }>;

export const SHARED_SELECT_OVERLAY_OWNERS = {
  "settings.rows": { module: "src/pages/settings/ui/rows.tsx", routeScope: { kind: "production-prefix", prefix: "settings." } },
  "shared.toolbar": { module: "src/pages/shared-library/ui/SharedLibraryToolbar.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.shared"] } },
  "shared.workflow": { module: "src/pages/shared-library/ui/SharedLibraryWorkflows.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.shared"] } },
  "memory.editor": { module: "src/pages/memory/ui/MemoryScreen.tsx", routeScope: { kind: "exact", routeKeys: ["workspace.memory"] } },
  "project.media": { module: "src/pages/project/ui/MediaPanel.tsx", routeScope: { kind: "exact", routeKeys: ["project.media"] } },
  "project.activity": { module: "src/pages/project/ui/ActivityTimeline.tsx", routeScope: { kind: "exact", routeKeys: ["project.activity"] } },
  "marketplace.header": { module: "src/pages/marketplace/ui/MarketplaceHeader.tsx", routeScope: { kind: "production-prefix", prefix: "marketplace." } },
} as const;

export type InstrumentOverlayId = keyof typeof INSTRUMENT_OVERLAYS;
export type InstrumentSharedSelectOwnerId = keyof typeof SHARED_SELECT_OVERLAY_OWNERS;

interface InstrumentOverlayBaseProps<Id extends InstrumentOverlayId> {
  id: Id;
  open: boolean;
  label: string;
  description: string;
  opener: HTMLElement | null;
  onOpenChange(open: boolean): void;
  children: ReactNode;
  localScroll?: boolean;
  /* This component renders the surface and the scrim, so a caller can only skin them from here.
     Both default to nothing: `[data-instrument-overlay-backdrop]` in instrument.css owns the
     scrim's tone for every overlay in the app, and each surface states its own plate. */
  surfaceClassName?: string;
  scrimClassName?: string;
}

type PrimitiveHostId = "shared-select-menu" | "workspace-picker" | "agent-chat-recent-menu" | "agent-chat-provider-menu" | "agent-chat-model-menu" | "agent-chat-mode-menu" | "agent-chat-context";
type PrimitiveOverlayBaseProps<Id extends PrimitiveHostId> = Omit<InstrumentOverlayBaseProps<Id>, "children"> & { children: ReactElement };
export type InstrumentOverlayProps<Id extends InstrumentOverlayId> =
  Id extends "shared-select-menu"
    ? PrimitiveOverlayBaseProps<Id> & { host: "primitive-host"; overlayOwner: InstrumentSharedSelectOwnerId }
    : Id extends PrimitiveHostId
      ? PrimitiveOverlayBaseProps<Id> & { host: "primitive-host"; overlayOwner?: never }
      : InstrumentOverlayBaseProps<Id> & { host?: "managed-portal"; overlayOwner?: never };

type RuntimeOverlayProps = InstrumentOverlayBaseProps<InstrumentOverlayId> & {
  host?: "managed-portal" | "primitive-host";
  overlayOwner?: unknown;
};

/* A managed dialog is one flat light widget clipped one gutter short of the window, so
   its square corners can never cross the window's own rounded clip. The surface states both
   halves of the pair: it is portalled to `document.body`, outside `.app-mode-work`, where the
   legacy inks resolve to the on-dark family and a light plate would carry near-white text.

   The authored sheet mirrored all of this onto `> :last-child` as well. That half is gone: it
   matched nothing in 169 measured state-runs, and a descendant variant is (0,1,1) -- it would
   outrank the caller's own per-element utilities and repaint a child that states its own plate.

   The focus trace is the ring the surface itself takes when the landing focus is on the surface
   rather than on a control inside it. `settings` declines both: it is a mode that owns the whole
   window, not a panel, and a ring traced around the viewport cuts across the window's rounding. */
/* The plate a managed dialog stands on is the app's window chrome, the same two layers the
   sidebar, the view panel and every hand-built modal now wear: one named shape for a window,
   so a new overlay cannot invent a third. The caller supplies the titlebar and the card. */
const MANAGED_SURFACE = `max-w-overlay-fit max-h-overlay-fit-block text-ink outline-0 ${WINDOW}`;
const MANAGED_SURFACE_FOCUS = "data-[instrument-surface-focus]:outline-2 data-[instrument-surface-focus]:outline-ink data-[instrument-surface-focus]:[outline-offset:-3px]";

function managedSurfaceClasses(id: InstrumentOverlayId, caller: string | undefined): string {
  const kind = INSTRUMENT_OVERLAYS[id].kind;
  const plate = kind === "dialog" && id !== "settings"
    ? `${MANAGED_SURFACE} ${MANAGED_SURFACE_FOCUS}`
    : "";
  return [plate, caller].filter(Boolean).join(" ");
}

const overlayRoles: Record<InstrumentOverlayKind, "dialog" | "listbox" | "menu" | "complementary"> = {
  dialog: "dialog",
  viewer: "dialog",
  listbox: "listbox",
  popover: "dialog",
  menu: "menu",
  sheet: "dialog",
  rail: "complementary",
};

const primitiveHostIds = new Set<PrimitiveHostId>([
  "shared-select-menu", "workspace-picker", "agent-chat-recent-menu", "agent-chat-provider-menu", "agent-chat-model-menu", "agent-chat-mode-menu",
  "agent-chat-context",
]);
const modalKinds = new Set<InstrumentOverlayKind>(["dialog", "viewer", "sheet"]);

const modalEnvironment = (() => {
  let locks = 0;
  let body: HTMLElement | null = null;
  let overflow = "";
  const background = new Map<HTMLElement, { ariaHidden: string | null; inert: string | null }>();

  const isOverlayPortal = (node: HTMLElement) => node.getAttribute("data-instrument-overlay") !== null
    || node.getAttribute("data-instrument-overlay-backdrop") !== null
    || node.querySelector("[data-instrument-overlay]") !== null;

  const markBackground = () => {
    if (!body) return;
    for (const node of Array.from(body.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !isOverlayPortal(child))) {
      if (!background.has(node)) background.set(node, {
        ariaHidden: node.getAttribute("aria-hidden"),
        inert: node.getAttribute("inert"),
      });
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("inert", "");
    }
  };

  return {
    acquire() {
      if (typeof document === "undefined") return () => undefined;
      if (locks++ === 0) {
        body = document.body;
        overflow = body.style.overflow || "";
        body.style.overflow = "hidden";
      }
      markBackground();
      return () => {
        if (locks === 0 || !body) return;
        if (--locks !== 0) return;
        for (const [node, snapshot] of background) {
          if (snapshot.ariaHidden === null) node.removeAttribute("aria-hidden"); else node.setAttribute("aria-hidden", snapshot.ariaHidden);
          if (snapshot.inert === null) node.removeAttribute("inert"); else node.setAttribute("inert", snapshot.inert);
        }
        body.style.overflow = overflow;
        background.clear();
        body = null;
      };
    },
  };
})();

function restoreFocus(opener: HTMLElement | null) {
  if (opener?.isConnected) opener.focus({ preventScroll: true });
}

function primitiveMarker(
  props: RuntimeOverlayProps,
): ReactElement {
  const marker = {
    "data-instrument-overlay": props.id,
    ...(props.id === "shared-select-menu" ? { "data-instrument-overlay-owner": props.overlayOwner } : {}),
  };
  const child = props.children;
  const forwardRef = typeof child === "object" && child !== null && isValidElement(child)
    && typeof child.type === "object" && child.type !== null && (child.type as { $$typeof?: symbol }).$$typeof === Symbol.for("react.forward_ref");
  if (!isValidElement(child) || child.type === Fragment || (typeof child.type !== "string" && !forwardRef)) {
    throw new Error("primitive-host requires exactly one concrete DOM-capable React element");
  }
  return cloneElement(child as ReactElement<Record<string, unknown>>, marker);
}

function useOpenerRestoration(open: boolean, opener: HTMLElement | null) {
  const openerRef = useRef(opener);
  openerRef.current = opener;
  useEffect(() => {
    if (!open) return;
    return () => restoreFocus(openerRef.current);
  }, [open]);
}

function useModalEnvironment(open: boolean) {
  useLayoutEffect(() => {
    if (!open) return;
    return modalEnvironment.acquire();
  }, [open]);
}

function ModalOverlay(props: RuntimeOverlayProps): ReactElement | null {
  const surface = useRef<HTMLDivElement>(null);
  const { id, open, label, description, children, localScroll, onOpenChange, opener, surfaceClassName, scrimClassName } = props;
  useOpenerRestoration(open, opener);
  useModalEnvironment(open);
  if (!open) return null;

  const close = () => {
    onOpenChange(false);
    restoreFocus(opener);
  };

  return <Dialog.Root open onOpenChange={(next) => { if (!next) close(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay data-instrument-overlay-backdrop="" className={scrimClassName} />
      <Dialog.Content
        ref={surface}
        className={managedSurfaceClasses(id, surfaceClassName)}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-instrument-overlay={id}
        data-instrument-overlay-kind={INSTRUMENT_OVERLAYS[id].kind}
        data-instrument-local-scroll={localScroll || undefined}
        style={localScroll ? { overflow: "auto" } : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          surface.current?.setAttribute("data-instrument-surface-focus", "");
          surface.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(opener); }}
        onFocusCapture={(event) => event.currentTarget.toggleAttribute("data-instrument-surface-focus", event.target === event.currentTarget)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.removeAttribute("data-instrument-surface-focus");
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          close();
        }}
      >
        <Dialog.Title hidden>{label}</Dialog.Title>
        <Dialog.Description hidden>{description}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function NonModalOverlay(props: RuntimeOverlayProps): ReactPortal | ReactElement | null {
  const surface = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const { id, open, label, description, children, localScroll, onOpenChange, opener, surfaceClassName } = props;
  useOpenerRestoration(open, opener);
  useEffect(() => {
    if (open) surface.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  const content = <div
    ref={surface}
    className={surfaceClassName}
    role={overlayRoles[INSTRUMENT_OVERLAYS[id].kind]}
    tabIndex={-1}
    aria-label={label}
    aria-describedby={description ? descriptionId : undefined}
    data-instrument-overlay={id}
    data-instrument-overlay-kind={INSTRUMENT_OVERLAYS[id].kind}
    data-instrument-local-scroll={localScroll || undefined}
    style={localScroll ? { overflow: "auto" } : undefined}
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
  const runtime = props as RuntimeOverlayProps;
  const { id, host = "managed-portal", overlayOwner } = runtime;
  if (host !== "managed-portal" && host !== "primitive-host") throw new Error(`${id} has an invalid overlay host`);
  if (id === "shared-select-menu") {
    if (host !== "primitive-host") throw new Error("shared-select-menu only supports primitive-host");
    if (typeof overlayOwner !== "string" || !(overlayOwner in SHARED_SELECT_OVERLAY_OWNERS)) throw new Error("shared-select-menu requires one registered overlay owner");
  } else if (overlayOwner !== undefined) {
    throw new Error(`${id} only accepts an overlay owner for shared-select-menu`);
  }
  if (primitiveHostIds.has(id as PrimitiveHostId) && host !== "primitive-host") throw new Error(`${id} only supports primitive-host`);
  if (host === "primitive-host") {
    if (!primitiveHostIds.has(id as PrimitiveHostId)) throw new Error(`${id} does not support primitive-host`);
    return runtime.open ? primitiveMarker(runtime) : null;
  }
  return modalKinds.has(INSTRUMENT_OVERLAYS[id].kind) ? <ModalOverlay {...runtime} /> : <NonModalOverlay {...runtime} />;
}
