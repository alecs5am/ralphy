import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type ReactPortal,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, LayoutGrid, MessageSquare, PanelLeft } from "lucide-react";

import { ResizeHandle } from "../components/ui/ResizeHandle";
import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentRightRailMode, InstrumentRightRailOwner } from "./types";
import type { WorkbenchLens } from "../state/workbench";

const DOCK_WINDOW_MIN = 1_280;
const DOCK_DESK_MIN = 680;
const RIGHT_RAIL_MIN = 292;
/* The chat lens' view panel: the handoff's 440 at 1440, 380 once the window is narrower, and
   nothing at all below the point where the chat itself stops being readable beside it. */
const VIEW_PANEL_WIDE = 440;
const VIEW_PANEL_NARROW = 380;
const VIEW_PANEL_DROP = 1_120;
const RIGHT_RAIL_MAX = 1_000;
const LEFT_MIN = 216;
const LEFT_MAX = 420;
const LEFT_DEFAULT = 260;

export interface InstrumentScrollContextValue {
  element: HTMLElement | null;
  /* Where a desk-level floating control mounts. It is the column rather than the scroller so
     the control keeps still while the desk scrolls under it, and it is centred on the project
     rather than on the window. */
  floatHost: HTMLElement | null;
  width: number;
  height: number;
  routeScrollKey: string;
  getOffset(): number;
  scrollToOffset(offset: number, behavior?: ScrollBehavior): void;
  capture(): { key: string; offset: number };
  restore(snapshot: { key: string; offset: number }): void;
}

export interface InstrumentRightRailContextValue {
  mode: InstrumentRightRailMode;
  owner: InstrumentRightRailOwner;
  open(opener: HTMLElement | null): void;
  close(): void;
}

export interface InstrumentShellProps {
  sidebar: ReactNode;
  desk: ReactNode;
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

interface PendingRouteTransition {
  from: string;
  to: string;
  offset: number;
}

interface InternalRightRailContextValue extends InstrumentRightRailContextValue {
  host: HTMLElement | null;
  register(owner: InstrumentRightRailOwner, label: string): () => void;
}

// A missing or NaN width must not collapse the layout maths, so an unusable request falls
// back to the column's own default rather than propagating into the dock calculation.
function clampWidth(requested: number, min: number, max: number, fallback: number): number {
  const value = Number.isFinite(requested) ? Math.round(requested) : fallback;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

const ScrollContext = createContext<InstrumentScrollContextValue | null>(null);
const RightRailContext = createContext<InternalRightRailContextValue | null>(null);

export function resolveRightRailMode(input: {
  dockEligible: boolean;
  preferenceOpen: boolean;
  overlayOpen: boolean;
}): InstrumentRightRailMode {
  if (input.dockEligible) return input.preferenceOpen ? "docked" : "closed";
  return input.overlayOpen ? "overlay" : "closed";
}

export function useInstrumentScroll(): InstrumentScrollContextValue {
  const value = useContext(ScrollContext);
  if (!value) throw new Error("useInstrumentScroll must be used inside InstrumentShell");
  return value;
}

export function useOptionalInstrumentScroll(): InstrumentScrollContextValue | null {
  return useContext(ScrollContext);
}

export function useInstrumentRightRail(): InstrumentRightRailContextValue {
  const value = useContext(RightRailContext);
  if (!value) throw new Error("useInstrumentRightRail must be used inside InstrumentShell");
  return value;
}

export function useOptionalInstrumentRightRail(): InstrumentRightRailContextValue | null {
  return useContext(RightRailContext);
}

export function InstrumentRightRailPortal({ owner, label, children }: {
  owner: InstrumentRightRailOwner;
  label: string;
  children: ReactNode;
}): ReactPortal | null {
  const rail = useContext(RightRailContext);
  const register = rail?.register;
  useLayoutEffect(() => register?.(owner, label), [label, owner, register]);
  if (!rail?.host || rail.mode === "closed" || rail.owner !== owner) return null;
  return createPortal(children, rail.host);
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
  const offsets = useRef(new Map<string, number>());
  const committedRouteKey = useRef(props.routeScrollKey);
  const pendingRouteTransition = useRef<PendingRouteTransition | null>(null);
  const focusedRailElement = useRef<HTMLElement | null>(null);
  const modeRef = useRef<InstrumentRightRailMode>("closed");

  if (props.routeScrollKey === committedRouteKey.current) {
    pendingRouteTransition.current = null;
  } else if (pendingRouteTransition.current?.to !== props.routeScrollKey) {
    const transition = {
      from: committedRouteKey.current,
      to: props.routeScrollKey,
      offset: deskElement?.scrollTop ?? 0,
    };
    offsets.current.set(transition.from, transition.offset);
    pendingRouteTransition.current = transition;
  }

  const leftWidth = clampWidth(props.leftWidth, LEFT_MIN, LEFT_MAX, LEFT_DEFAULT);
  const leftColumn = props.leftVisible ? leftWidth : 0;
  // The rail may not eat the desk: its ceiling is whatever is left after the sidebar and the
  // desk minimum, so dragging wide on a narrow window cannot silently flip it to overlay.
  const railMax = Math.max(
    RIGHT_RAIL_MIN,
    Math.min(RIGHT_RAIL_MAX, dimensions.frameWidth - leftColumn - DOCK_DESK_MIN),
  );
  const railWidth = clampWidth(props.rightWidth, RIGHT_RAIL_MIN, railMax, RIGHT_RAIL_MIN);
  const dockedDeskWidth = modeRef.current === "docked"
    ? dimensions.deskWidth
    : dimensions.deskWidth - railWidth;
  const dockEligible = dimensions.frameWidth >= DOCK_WINDOW_MIN && dockedDeskWidth >= DOCK_DESK_MIN;
  /* Under the chat lens the rail *is* the main column, so it is docked whatever the desk
     minimum says -- the desk is deliberately the narrow one. The view panel is what gives way
     on a narrow window: below VIEW_PANEL_DROP the chat takes the whole content area rather than
     the two columns squeezing each other. Inverting the overlay machinery so the *desk* could
     portal over the chat is the handoff's own next iteration, not this one. */
  const chatLens = props.lens === "chat";
  const viewPanelWidth = dimensions.frameWidth >= DOCK_WINDOW_MIN ? VIEW_PANEL_WIDE : VIEW_PANEL_NARROW;
  const viewPanelVisible = chatLens && dimensions.frameWidth >= VIEW_PANEL_DROP;
  const mode = chatLens ? "docked" : resolveRightRailMode({
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

  useLayoutEffect(() => {
    if (!deskElement) return;
    const transition = pendingRouteTransition.current;
    if (transition?.to === props.routeScrollKey) {
      offsets.current.set(transition.from, transition.offset);
      pendingRouteTransition.current = null;
    }
    committedRouteKey.current = props.routeScrollKey;
    const targetOffset = offsets.current.get(props.routeScrollKey) ?? 0;
    let frame = 0;
    const observer = new MutationObserver(() => restoreWhenReady());
    const restoreWhenReady = () => {
      const available = Math.max(0, deskElement.scrollHeight - deskElement.clientHeight);
      deskElement.scrollTo({ top: Math.min(targetOffset, available) });
      if (targetOffset === 0 || available >= targetOffset) observer.disconnect();
    };
    observer.observe(deskElement, { attributes: true, childList: true, subtree: true });
    restoreWhenReady();
    frame = window.requestAnimationFrame(restoreWhenReady);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [deskElement, props.routeScrollKey]);

  useLayoutEffect(() => {
    if (!railHost || !railParking) return;
    const target = mode === "docked"
      ? dockedRailTarget
      : mode === "overlay"
        ? overlayRailTarget
        : railParking;
    if (!target) return;
    target.appendChild(railHost);
    const focused = focusedRailElement.current;
    let focusTimer = 0;
    if (focused && railHost.contains(focused) && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
    if (mode !== "closed" && focused && railHost.contains(focused)) {
      focusTimer = window.setTimeout(() => focused.focus({ preventScroll: true }), 0);
    }
    focusedRailElement.current = null;
    return () => {
      window.clearTimeout(focusTimer);
      const active = document.activeElement;
      if (active instanceof HTMLElement && railHost.contains(active)) focusedRailElement.current = active;
      railParking.appendChild(railHost);
    };
  }, [dockedRailTarget, mode, overlayRailTarget, railHost, railParking]);

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
      offsets.current.set(snapshot.key, snapshot.offset);
      if (snapshot.key === props.routeScrollKey) deskElement?.scrollTo({ top: snapshot.offset });
    },
  }), [deskColumn, deskElement, dimensions.deskHeight, dimensions.deskWidth, props.routeScrollKey]);

  const railContext = useMemo<InternalRightRailContextValue>(() => ({
    mode,
    owner: activeRail.owner,
    host: railHost,
    open: openRail,
    close: closeRail,
    register,
  }), [activeRail.owner, closeRail, mode, openRail, railHost, register]);

  const railContentHidden = activeRail.owner !== "chat" && activeRail.owner !== "media-review";
  return <ScrollContext.Provider value={scrollContext}>
    <RightRailContext.Provider value={railContext}>
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
            min={LEFT_MIN}
            max={LEFT_MAX}
            defaultValue={LEFT_DEFAULT}
            direction={1}
            className="resize-instrument-sidebar absolute top-0 -right-2 bottom-0 w-2 cursor-col-resize"
            onChange={props.onLeftWidthChange}
            onActiveChange={setColumnResizing}
          />
        </div>}
        <div className="instrument-content-column flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          <header className="instrument-top-row relative flex h-11 min-w-0 flex-none items-center gap-3 px-0.5 [-webkit-app-region:drag]">
            {/* The sidebar owns its own collapse control now; the topbar carries it only while the
                sidebar is gone, which is the one state where the sidebar's own button is not on
                screen. History stays here in both states -- it is about the content column. */}
            {props.topChrome && <div className="flex flex-none items-center gap-1 [-webkit-app-region:no-drag]">
              {!props.leftVisible && <>
                <div className="w-traffic-main h-px flex-none" aria-hidden="true" />
                <button className="grid size-7 place-items-center rounded-full text-ink hover:bg-desk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" title="Show sidebar" aria-label="Toggle sidebar" aria-pressed="false" onClick={props.onToggleLeft}>
                  <PanelLeft size={15} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </>}
              <button className="grid size-7 place-items-center rounded-full text-muted hover:bg-desk-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-35" type="button" title="Back" aria-label="Back" disabled={!props.topChrome.canGoBack} onClick={props.topChrome.onBack}>
                <ArrowLeft size={15} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <button className="grid size-7 place-items-center rounded-full text-muted hover:bg-desk-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-35" type="button" title="Forward" aria-label="Forward" disabled={!props.topChrome.canGoForward} onClick={props.topChrome.onForward}>
                <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>}
            {/* The lens pair: how you are working, as against the sidebar's place switch, which is
                where you are. Two circles in one pill; the active one is the desk's inversion. */}
            {props.onLensChange && <div className="instrument-lens flex flex-none items-center gap-0.5 rounded-full bg-card p-0.75 [-webkit-app-region:no-drag]" role="group" aria-label="Working lens">
              {([["desk", LayoutGrid, "Desk lens"], ["chat", MessageSquare, "Chat lens"]] as const).map(([lens, Icon, label]) => {
                const active = props.lens === lens;
                return <button
                  className={`instrument-lens-button grid size-7 place-items-center rounded-full ${active
                    ? "bg-desk-primary text-desk-primary-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-desk-primary-ink"
                    : "bg-transparent text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"}`}
                  type="button"
                  key={lens}
                  title={label}
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => props.onLensChange?.(lens)}
                ><Icon size={15} strokeWidth={1.8} aria-hidden="true" /></button>;
              })}
            </div>}
            <div className="instrument-island-slot ml-auto flex flex-none items-center [-webkit-app-region:no-drag]">{props.island}</div>
          </header>
          <div className="instrument-content-body flex min-h-0 min-w-0 flex-1 gap-2">
            <section
              /* Desk lens: the route takes the elastic column. Chat lens: it becomes the fixed
                 view panel beside the chat, and disappears entirely once the window is too
                 narrow to hold both. */
              className={`instrument-desk-column relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-desk ${chatLens ? "order-last flex-none" : "flex-1"} ${chatLens && !viewPanelVisible ? "hidden" : ""}`}
              style={chatLens ? { width: viewPanelWidth } : undefined}
              data-instrument-view-panel={chatLens || undefined}
              hidden={chatLens && !viewPanelVisible}
              ref={setDeskColumn}
            >
              <div
                /* The desk is the app's one scroll surface and the container eight other areas' width
                   variants read, so both the name and the type are stated here. */
                className="instrument-desk-scroll @container/instrument-desk min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
                ref={setDeskElement}
                data-instrument-scroll-owner="instrument-desk-scroll"
                inert={mode === "overlay" || undefined}
                aria-hidden={mode === "overlay" || undefined}
              >
                {props.desk}
              </div>
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
                min={RIGHT_RAIL_MIN}
                max={railMax}
                defaultValue={RIGHT_RAIL_MIN}
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
    </RightRailContext.Provider>
  </ScrollContext.Provider>;
}
