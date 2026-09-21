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
  deskFill?: boolean;
  pageHeaderRef?(element: HTMLDivElement | null): void;
  /**
   * Wrap the desk scroller with the content frame. The shell keeps the same scroller and reports
   * its measured width so scroll restoration, container queries and tab overflow stay in sync.
   */
  viewPanelFrame?(page: ReactNode, compact: boolean, width: number): ReactNode;
  /** Whether the panel is showing at all. `⌘\` collapses it and the chat takes the width. */
  viewOpen: boolean;
  viewExpanded?: boolean;
  /** An explicit agent request takes priority over an inspector already holding the rail. */
  agentRequest?: number;
  /** Retained for existing callers; content now fills the space beside the agent rail. */
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
  rightRailEnabled?: boolean;
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
  const [registeredRail, setActiveRail] = useState<{ owner: InstrumentRightRailOwner; label: string }>({ owner: "chat", label: "Agent chat" });
  const [agentPriority, setAgentPriority] = useState(props.lens === "chat");
  const activeRail = agentPriority ? { owner: "chat" as const, label: "Agent chat" } : registeredRail;
  const registrations = useRef<RailRegistration[]>([]);
  const openerRef = useRef<HTMLElement | null>(null);
  const focusedRailElement = useRef<HTMLElement | null>(null);
  const rememberOffset = useDeskScrollMemory(deskElement, props.routeScrollKey);
  const modeRef = useRef<InstrumentRightRailMode>("closed");

  useLayoutEffect(() => { setAgentPriority(props.lens === "chat"); }, [props.lens, props.agentRequest]);

  const {
    leftWidth,
    leftColumn,
    railWidth,
    dockEligible,
    viewPanelFits,
    bounds,
  } = shellColumns({
    dimensions,
    leftVisible: props.leftVisible,
    leftWidth: props.leftWidth,
    rightWidth: props.rightWidth,
    viewWidth: props.viewWidth,
    railDocked: modeRef.current === "docked",
    chatLens: props.lens === "chat",
  });
  const chatLens = props.lens === "chat";
  const expanded = chatLens && props.viewOpen && props.viewExpanded;
  const contentVisible = !chatLens || props.viewOpen;
  /* Agent intent is retained when the window narrows; the existing modal rail keeps the
     conversation reachable without replacing or unmounting the content behind it. */
  const mode = props.rightRailEnabled === false ? "closed" : chatLens
    ? expanded ? "closed" : !props.viewOpen || viewPanelFits ? "docked" : "overlay"
    : activeRail.owner === "chat"
      ? "closed"
      : resolveRightRailMode({
        dockEligible,
        preferenceOpen: props.rightPreference,
        overlayOpen: props.rightOverlayOpen,
      });
  const agentVisible = chatLens && mode !== "closed" && activeRail.owner === "chat";
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
    setAgentPriority(false);
    openerRef.current = opener;
    if (dockEligible) {
      if (!props.rightPreference) props.onToggleRightPreference();
      return;
    }
    props.onRightOverlayOpenChange(true);
  }, [dockEligible, props]);

  const closeRail = useCallback(() => {
    if (chatLens) { props.onRightOverlayOpenChange(false); props.onLensChange?.("desk"); }
    else if (mode === "overlay") props.onRightOverlayOpenChange(false);
    else if (mode === "docked") props.onToggleRightPreference();
  }, [chatLens, mode, props]);

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
        /* Four-pixel gutters keep the full-height sidebar and content columns close without
           taking space from the page. The top row remains the window's only page chrome. */
        className="instrument-shell col-span-3 row-start-1 row-end-2 flex h-full min-h-0 w-full min-w-0 gap-1 overflow-hidden bg-desk p-1 data-[rail-resizing]:cursor-col-resize data-[rail-resizing]:select-none"
        ref={frameRef}
        data-right-rail-mode={mode}
        data-instrument-native-inset="76"
        data-rail-resizing={columnResizing || undefined}
        style={{
          "--instrument-left-width": `${leftColumn}px`,
          "--instrument-right-rail-width": `${railWidth}px`,
        } as CSSProperties}
      >
        {props.leftVisible && <div className="instrument-left-stack relative flex h-full min-h-0 flex-none" style={{ width: leftColumn }}>
          {props.sidebar}
          {/* Keep an eight-pixel drag target centered on the narrower gutter. */}
          <ResizeHandle
            ariaLabel="Resize sidebar"
            orientation="vertical"
            value={leftWidth}
            min={bounds.left.min}
            max={bounds.left.max}
            defaultValue={bounds.left.fallback}
            direction={1}
            className="resize-instrument-sidebar absolute top-0 -right-1.5 bottom-0 w-2 cursor-col-resize"
            onChange={props.onLeftWidthChange}
            onActiveChange={setColumnResizing}
          />
        </div>}
        <div className="instrument-content-column flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <ShellTopRow
            pageHeaderRef={props.pageHeaderRef}
            leftVisible={props.leftVisible}
            agentVisible={agentVisible}
            topChrome={props.topChrome}
            island={props.island}
            onToggleLeft={props.onToggleLeft}
            onAgentToggle={props.onLensChange ? (opener) => {
              openerRef.current = opener;
              setAgentPriority(!agentVisible);
              props.onLensChange?.(agentVisible ? "desk" : "chat");
            } : undefined}
          />
          <div className="instrument-content-body relative flex min-h-0 min-w-0 flex-1 gap-1">
            {/* Keep the rail grabber outside the clipping aside, in the gap between columns. */}
            {mode === "docked" && contentVisible && <ResizeHandle
              ariaLabel="Resize agent panel"
              orientation="vertical"
              value={railWidth}
              min={bounds.rail.min}
              max={bounds.rail.max}
              defaultValue={bounds.rail.fallback}
              direction={-1}
              className="resize-instrument-rail absolute top-0 right-(--instrument-right-rail-width) bottom-0 w-2 cursor-col-resize"
              onChange={props.onRightWidthChange}
              onActiveChange={setColumnResizing}
            />}
            <section
              className={`instrument-desk-column relative min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-desk ${contentVisible ? "flex" : "hidden"}`}
              data-instrument-view-panel={chatLens || undefined}
              hidden={!contentVisible}
              ref={setDeskColumn}
            >
              {(props.viewPanelFrame ?? ((page: ReactNode) => page))(<div
                /* The desk is the app's one scroll surface and the container eight other areas' width
                   variants read, so both the name and the type are stated here. */
                className={`instrument-desk-scroll @container/instrument-desk min-h-0 min-w-0 flex-1 overflow-x-hidden overscroll-contain ${props.deskFill ? "flex flex-col overflow-hidden [scrollbar-gutter:auto]" : "overflow-y-auto [&_.overscroll-contain]:overscroll-auto"}`}
                ref={setDeskElement}
                data-instrument-scroll-owner="instrument-desk-scroll"
                data-scroll-mode={props.deskFill ? "page" : "desk"}
                inert={mode === "overlay" || undefined}
                aria-hidden={mode === "overlay" || undefined}
              >
                {props.desk}
              </div>, false, dimensions.deskWidth)}
            </section>
            <aside className={`instrument-right-rail relative min-h-0 min-w-0 overflow-hidden bg-desk ${mode === "docked" ? "flex" : "hidden"} ${contentVisible ? "flex-none" : "flex-1"}`} style={contentVisible ? { width: railWidth } : undefined} aria-label={activeRail.label} hidden={mode !== "docked"} inert={mode !== "docked" || undefined}>
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
        onOpenChange={(open) => { if (!open && chatLens) closeRail(); else props.onRightOverlayOpenChange(open); }}
        localScroll
        scrimClassName="z-sheet-backdrop bg-instrument/52"
        surfaceClassName="fixed z-sheet inset-y-2 right-2 w-max max-w-overlay-fit max-h-overlay-fit-block rounded-panel bg-instrument text-on-instrument"
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
