import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ResizeHandle } from "@/shared/ui/ResizeHandle";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";
import type { InstrumentRightRailMode, InstrumentRightRailOwner } from "@/shared/instrument/types";
import {
  InstrumentScrollProvider,
  useOptionalInstrumentScroll,
  type InstrumentScrollContextValue,
} from "@/shared/lib/instrument-scroll";
import {
  InstrumentRightRailProvider,
  resolveRightRailMode,
  type InstrumentRightRailProviderValue,
} from "@/shared/lib/instrument-rail";
import type { WorkbenchLens } from "@/shared/model/workbench";

import { shellColumns } from "./shell-geometry";
import { useDeskScrollMemory } from "./use-desk-scroll-memory";
import { useRailHost } from "./use-rail-host";
import { ShellTopRow } from "./ShellTopRow";

export interface InstrumentShellProps {
  sidebar: ReactNode;
  desk: ReactNode;
  /**
   * The chat lens' panel chrome, as a wrapper around the desk's own scroller: the tab strip and
   * the page card belong to the panel, and the scroller has to stay the shell's so scroll
   * restoration and the desk container query keep working inside the card. Absent under the desk
   * lens, where the route has no chrome of its own.
   */
  viewPanelFrame?(page: ReactNode): ReactNode;
  /** Whether the panel is showing at all. `⌘\` collapses it and the chat takes the width. */
  viewOpen: boolean;
  viewWidth: number;
  onViewWidthChange(width: number): void;
  chat: ReactNode;
  island: ReactNode;
  routeScrollKey: string;
  leftVisible: boolean;
  leftWidth: number;
  onLeftWidthChange(width: number): void;
  rightWidth: number;
  onRightWidthChange(width: number): void;
  rightPreference: boolean;
  rightOverlayOpen: boolean;
  lens: WorkbenchLens;
  /** Absent where the lens does not apply: the place switch's other place has no chat of its own. */
  onLensChange?(lens: WorkbenchLens): void;
  topChrome?: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack(): void;
    onForward(): void;
  };
  onToggleLeft(): void;
  onToggleRightPreference(): void;
  onRightOverlayOpenChange(open: boolean): void;
}

interface RailRegistration {
  token: symbol;
  owner: InstrumentRightRailOwner;
  label: string;
}

// A missing or NaN width must not collapse the layout maths, so an unusable request falls
// back to the column's own default rather than propagating into the dock calculation.
/* Whether the floats in this subtree may escape to the shared column. They have to escape while
   their surface is on screen -- a dock has to hold still while the page under it scrolls, and the
   column is the box with that geometry -- but the column is shared by both app modes, so a float
   that escaped unconditionally outlived the surface it belongs to and stood over the other mode.
   Denied the escape it renders where it was written instead, under its own surface's `hidden`. */
export function InstrumentFloatHost({ escape, children }: { escape: boolean; children: ReactNode }) {
  const outer = useOptionalInstrumentScroll();
  const value = useMemo(() => outer && (escape ? outer : { ...outer, floatHost: null }), [outer, escape]);
  return value ? <InstrumentScrollProvider value={value}>{children}</InstrumentScrollProvider> : children;
}

export function InstrumentShell(props: InstrumentShellProps): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const [deskElement, setDeskElement] = useState<HTMLDivElement | null>(null);
  const [deskColumn, setDeskColumn] = useState<HTMLElement | null>(null);
  const [railHost] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const host = document.createElement("div");
    // The host is created imperatively so it can be re-parented between the docked column, the
    // overlay sheet and the parking bay without React remounting the rail inside it.
    host.setAttribute("class", "instrument-right-rail-host flex size-full flex-col overflow-hidden");
    return host;
  });
  const [columnResizing, setColumnResizing] = useState(false);
  const [railParking, setRailParking] = useState<HTMLDivElement | null>(null);
  const [dockedRailTarget, setDockedRailTarget] = useState<HTMLDivElement | null>(null);
  const [overlayRailTarget, setOverlayRailTarget] = useState<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ frameWidth: 0, deskWidth: 0, deskHeight: 0 });
  const [activeRail, setActiveRail] = useState<{ owner: InstrumentRightRailOwner; label: string }>({ owner: "chat", label: "Agent chat" });
  const registrations = useRef<RailRegistration[]>([]);
  const openerRef = useRef<HTMLElement | null>(null);
  const focusedRailElement = useRef<HTMLElement | null>(null);
  const rememberOffset = useDeskScrollMemory(deskElement, props.routeScrollKey);
  const modeRef = useRef<InstrumentRightRailMode>("closed");

  const {
    leftWidth,
    leftColumn,
    railWidth,
    dockEligible,
    viewPanelWidth,
    viewPanelFits,
    bounds,
  } = shellColumns({
    dimensions,
    leftVisible: props.leftVisible,
    leftWidth: props.leftWidth,
    rightWidth: props.rightWidth,
    viewWidth: props.viewWidth,
    railDocked: modeRef.current === "docked",
  });
  /* Under the chat lens the rail *is* the main column, so it is docked whatever the desk
     minimum says -- the desk is deliberately the narrow one. The view panel is what gives way
     on a narrow window: below the drop width the chat takes the whole content area rather than
     the two columns squeezing each other. Inverting the overlay machinery so the *desk* could
     portal over the chat is the handoff's own next iteration, not this one. */
  const chatLens = props.lens === "chat";
  const viewPanelVisible = chatLens && props.viewOpen && viewPanelFits;
  /* Under the desk lens the chat is not reachable at all -- the lens exists so the desk can have
     the whole content area, and a chat column standing beside it would be the state the lens was
     introduced to replace. The media-review console shares this dock and is not chat, so it keeps
     its own path: closing the rail on owner alone would have removed a working feature. */
  const mode = chatLens
    ? "docked"
    : activeRail.owner === "chat"
      ? "closed"
      : resolveRightRailMode({
        dockEligible,
        preferenceOpen: props.rightPreference,
        overlayOpen: props.rightOverlayOpen,
      });
  if (mode !== modeRef.current && railHost) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && railHost.contains(active)) focusedRailElement.current = active;
  }
  modeRef.current = mode;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || !deskElement) return;
    const measure = () => {
      const frameBounds = frame.getBoundingClientRect();
      const deskBounds = deskElement.getBoundingClientRect();
      setDimensions((current) => {
        const next = { frameWidth: frameBounds.width, deskWidth: deskBounds.width, deskHeight: deskBounds.height };
        return current.frameWidth === next.frameWidth && current.deskWidth === next.deskWidth && current.deskHeight === next.deskHeight
          ? current
          : next;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(deskElement);
    measure();
    return () => observer.disconnect();
  }, [deskElement]);

  useRailHost({ railHost, railParking, dockedRailTarget, overlayRailTarget, mode, focusedRailElement });

  useLayoutEffect(() => {
    if (!deskElement || mode !== "overlay") return;
    const overflow = deskElement.style.overflow;
    deskElement.style.overflow = "hidden";
    return () => { deskElement.style.overflow = overflow; };
  }, [deskElement, mode]);

  useLayoutEffect(() => {
    if (dockEligible && props.rightOverlayOpen) props.onRightOverlayOpenChange(false);
  }, [dockEligible, props.onRightOverlayOpenChange, props.rightOverlayOpen]);

  const register = useCallback((owner: InstrumentRightRailOwner, label: string) => {
    const registration = { token: Symbol(owner), owner, label };
    registrations.current.push(registration);
    setActiveRail({ owner, label });
    return () => {
      registrations.current = registrations.current.filter(({ token }) => token !== registration.token);
      const fallback = registrations.current.at(-1);
      setActiveRail(fallback ? { owner: fallback.owner, label: fallback.label } : { owner: "chat", label: "Agent chat" });
    };
  }, []);

  const openRail = useCallback((opener: HTMLElement | null) => {
    openerRef.current = opener;
    if (dockEligible) {
      if (!props.rightPreference) props.onToggleRightPreference();
      return;
    }
    props.onRightOverlayOpenChange(true);
  }, [dockEligible, props]);

  const closeRail = useCallback(() => {
    if (mode === "overlay") props.onRightOverlayOpenChange(false);
    else if (mode === "docked") props.onToggleRightPreference();
  }, [mode, props]);

  const scrollContext = useMemo<InstrumentScrollContextValue>(() => ({
    element: deskElement,
    floatHost: deskColumn,
    width: dimensions.deskWidth,
    height: dimensions.deskHeight,
    routeScrollKey: props.routeScrollKey,
    getOffset: () => deskElement?.scrollTop ?? 0,
    scrollToOffset: (offset, behavior) => deskElement?.scrollTo({ top: offset, behavior }),
    capture: () => ({ key: props.routeScrollKey, offset: deskElement?.scrollTop ?? 0 }),
    restore: (snapshot) => {
      rememberOffset(snapshot.key, snapshot.offset);
      if (snapshot.key === props.routeScrollKey) deskElement?.scrollTo({ top: snapshot.offset });
    },
  }), [deskColumn, deskElement, dimensions.deskHeight, dimensions.deskWidth, props.routeScrollKey]);

  const railContext = useMemo<InstrumentRightRailProviderValue>(() => ({
    mode,
    owner: activeRail.owner,
    host: railHost,
    open: openRail,
    close: closeRail,
    register,
  }), [activeRail.owner, closeRail, mode, openRail, railHost, register]);

  /* Media review used to share this dock with the chat, which is why both could be visible at
     once; it is a context menu on the asset now, so the rail shows the chat or it shows the one
     panel that took it. */
  const railContentHidden = activeRail.owner !== "chat";
  return <InstrumentScrollProvider value={scrollContext}>
    <InstrumentRightRailProvider value={railContext}>
      <div
        /* Handoff 13's window: 8px of desk on all four sides, an 8px zone gap, and nothing
           touching the window edge. The sidebar is full height and the topbar belongs to the
           content column rather than spanning the window, which is what lets the sidebar hold
           the traffic lights and the wordmark in its own header. */
        className="instrument-shell col-span-3 row-start-1 row-end-2 flex h-full min-h-0 w-full min-w-0 gap-2 overflow-hidden bg-desk p-2 data-[rail-resizing]:cursor-col-resize data-[rail-resizing]:select-none"
        ref={frameRef}
        data-right-rail-mode={mode}
        data-instrument-native-inset="76"
        data-rail-resizing={columnResizing || undefined}
        style={{
          "--instrument-left-width": `${leftColumn}px`,
          "--instrument-right-rail-width": `${railWidth}px`,
          "--instrument-view-width": `${viewPanelWidth}px`,
        } as CSSProperties}
      >
        {props.leftVisible && <div className="instrument-left-stack relative flex h-full min-h-0 flex-none" style={{ width: leftColumn }}>
          {props.sidebar}
          {/* The grabber straddles the window's own 8px zone gap rather than eating into the
              sidebar card, so the card keeps its full 260 and the drag target stays 8 wide. */}
          <ResizeHandle
            ariaLabel="Resize sidebar"
            orientation="vertical"
            value={leftWidth}
            min={bounds.left.min}
            max={bounds.left.max}
            defaultValue={bounds.left.fallback}
            direction={1}
            className="resize-instrument-sidebar absolute top-0 -right-2 bottom-0 w-2 cursor-col-resize"
            onChange={props.onLeftWidthChange}
            onActiveChange={setColumnResizing}
          />
        </div>}
        <div className="instrument-content-column flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {/* The topbar is exactly as tall as the island, so the island's top edge is the window's
              own 8px inset -- the same line the sidebar card starts on. A taller band would leave
              air above the tallest thing in it, which reads as a wrong margin. */}
          {/* No horizontal padding: every zone in the window stands 8 from its edge, and the
              handoff's 2px optical inset put the island 10 from the right while the sidebar
              stood at 8. */}
          <ShellTopRow
            leftVisible={props.leftVisible}
            lens={props.lens}
            topChrome={props.topChrome}
            island={props.island}
            onToggleLeft={props.onToggleLeft}
            onLensChange={props.onLensChange}
          />
          <div className="instrument-content-body relative flex min-h-0 min-w-0 flex-1 gap-2">
            {/* The grabber straddles the zone gap between the chat and the panel, on the panel's
                own left edge, so the panel keeps its full width and the drag target stays 8 wide.
                It is a sibling of the column rather than a child: the column clips its own
                overflow, so a handle at -left-2 inside it was laid out in the gap and then clipped
                away -- present in the DOM, measurable, and never painted. Under the desk lens the
                route is the elastic column and has no width to set. */}
            {chatLens && viewPanelVisible && <ResizeHandle
              ariaLabel="Resize view panel"
              orientation="vertical"
              value={viewPanelWidth}
              min={bounds.view.min}
              max={bounds.view.max}
              defaultValue={bounds.view.fallback}
              direction={-1}
              className="resize-instrument-view absolute top-0 right-(--instrument-view-width) bottom-0 w-2 cursor-col-resize"
              onChange={props.onViewWidthChange}
              onActiveChange={setColumnResizing}
            />}
            <section
              /* Desk lens: the route takes the elastic column. Chat lens: it becomes the fixed
                 view panel beside the chat, and disappears entirely once the window is too
                 narrow to hold both. */
              className={`instrument-desk-column relative flex min-h-0 min-w-0 flex-col overflow-hidden ${chatLens ? "order-last flex-none" : "flex-1 bg-desk"} ${chatLens && !viewPanelVisible ? "hidden" : ""}`}
              style={chatLens ? { width: viewPanelWidth } : undefined}
              data-instrument-view-panel={chatLens || undefined}
              hidden={chatLens && !viewPanelVisible}
              ref={setDeskColumn}
            >
              {(props.viewPanelFrame ?? ((page: ReactNode) => page))(<div
                /* The desk is the app's one scroll surface and the container eight other areas' width
                   variants read, so both the name and the type are stated here. */
                className="instrument-desk-scroll @container/instrument-desk min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
                ref={setDeskElement}
                data-instrument-scroll-owner="instrument-desk-scroll"
                inert={mode === "overlay" || undefined}
                aria-hidden={mode === "overlay" || undefined}
              >
                {props.desk}
              </div>)}
            </section>
            {/* The rail stands beside the desk, inside the content column, so the window's own zone
                gap is the only inset it needs. The "right" in the class name and the props is
                historical -- the rail is a dock, not a side. */}
            <aside className={`instrument-right-rail relative min-h-0 min-w-0 overflow-hidden bg-desk ${mode === "docked" ? "flex" : "hidden"} ${chatLens ? "flex-1" : ""}`} style={chatLens ? undefined : { width: railWidth }} aria-label={activeRail.label} hidden={mode !== "docked"}>
              {/* The grabber sizes the rail only while the rail is the narrow column. Under the
                  chat lens the rail is elastic and the view panel is what has a width. */}
              {!chatLens && <ResizeHandle
                ariaLabel="Resize agent panel"
                orientation="vertical"
                value={railWidth}
                min={bounds.rail.min}
                max={bounds.rail.max}
                defaultValue={bounds.rail.fallback}
                direction={-1}
                className="resize-instrument-rail absolute top-0 -left-2 bottom-0 w-2 cursor-col-resize"
                onChange={props.onRightWidthChange}
                onActiveChange={setColumnResizing}
              />}
              <div className="min-h-0 min-w-0 flex-1" ref={setDockedRailTarget} />
            </aside>
          </div>
        </div>
        <div className="instrument-rail-parking" ref={setRailParking} hidden inert>
        </div>
      </div>
      {/* The sheet is portalled to `document.body`, so it cannot read the shell's own
          `--instrument-right-rail-width`: a `var()` in a rule is substituted on the element that
          reads it, and outside the shell that variable does not exist. The authored
          `width: min(var(--instrument-right-rail-width), ...)` was therefore invalid at
          computed-value time and the sheet rendered at whatever width its content asked for.
          The plate now takes its width from the column it is standing in for, stated on the
          child that is inside this component's scope, and the fit key clamps it to the window. */}
      <InstrumentOverlay
        id="right-rail-sheet"
        open={mode === "overlay"}
        label={activeRail.label}
        description="Contextual controls for the active screen"
        opener={openerRef.current}
        onOpenChange={props.onRightOverlayOpenChange}
        localScroll
        scrimClassName="z-sheet-backdrop bg-instrument/52"
        surfaceClassName="fixed z-sheet inset-y-2 left-2 w-max max-w-overlay-fit max-h-overlay-fit-block rounded-panel bg-instrument text-on-instrument"
      >
        <div className="flex min-h-full" style={{ width: railWidth }} ref={setOverlayRailTarget} />
      </InstrumentOverlay>
      {railHost && createPortal(
        <div
          /* A `hidden` attribute is a user-agent rule, so the `display: flex` this row needs when
             it is showing would beat it; the two states are one utility instead. */
          className={`instrument-chat-rail-content size-full min-h-0 flex-col [&>.utility-right-panel]:size-full ${railContentHidden ? "hidden" : "flex"}`}
          hidden={railContentHidden}
          inert={railContentHidden || undefined}
          onFocusCapture={(event) => { focusedRailElement.current = event.target as HTMLElement; }}
        >{props.chat}</div>,
        railHost,
        "instrument-persistent-right-rail",
      )}
    </InstrumentRightRailProvider>
  </InstrumentScrollProvider>;
}
