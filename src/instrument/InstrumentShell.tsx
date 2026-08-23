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
import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";

import { ResizeHandle } from "../components/ui/ResizeHandle";
import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentRightRailMode, InstrumentRightRailOwner } from "./types";

const DOCK_WINDOW_MIN = 1_280;
const DOCK_DESK_MIN = 680;
const RIGHT_RAIL_MIN = 292;
const RIGHT_RAIL_MAX = 1_000;
const LEFT_MIN = 216;
const LEFT_MAX = 420;
const LEFT_DEFAULT = 240;

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
  const mode = resolveRightRailMode({
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
        className="instrument-shell col-span-3 row-start-1 row-end-2 grid h-full min-h-0 w-full min-w-0 overflow-hidden bg-desk grid-cols-[var(--instrument-left-width)_auto_minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)]"
        ref={frameRef}
        data-right-rail-mode={mode}
        data-instrument-native-inset="76"
        data-rail-resizing={columnResizing || undefined}
        style={{
          "--instrument-left-width": `${leftColumn}px`,
          "--instrument-right-rail-width": `${railWidth}px`,
        } as CSSProperties}
      >
        <header
          className="instrument-top-row relative col-span-3 row-start-1 grid h-12 min-h-0 min-w-0 items-center bg-desk [-webkit-app-region:drag]"
          style={{ gridTemplateColumns: `${leftColumn}px ${mode === "docked" ? railWidth : 0}px minmax(0, 1fr)` }}
        >
          {props.topChrome && <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1 pl-[84px] [-webkit-app-region:no-drag]">
            <button className="grid size-7 place-items-center rounded-full text-ink hover:bg-board focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" title={props.leftVisible ? "Hide sidebar" : "Show sidebar"} aria-label="Toggle sidebar" aria-pressed={props.leftVisible} onClick={props.onToggleLeft}>
              <PanelLeft size={15} strokeWidth={1.6} aria-hidden="true" />
            </button>
            <button className="grid size-7 place-items-center rounded-full text-muted hover:bg-board hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-35" type="button" title="Back" aria-label="Back" disabled={!props.topChrome.canGoBack} onClick={props.topChrome.onBack}>
              <ArrowLeft size={15} strokeWidth={1.6} aria-hidden="true" />
            </button>
            <button className="grid size-7 place-items-center rounded-full text-muted hover:bg-board hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-35" type="button" title="Forward" aria-label="Forward" disabled={!props.topChrome.canGoForward} onClick={props.topChrome.onForward}>
              <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>}
          <div className="instrument-island-slot absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 items-start pt-1.5 [-webkit-app-region:no-drag]">{props.island}</div>
        </header>
        {props.leftVisible && <div className="instrument-left-stack relative col-start-1 row-start-2 flex h-full min-h-0 w-full overflow-hidden bg-desk p-2 pt-0">
          {props.sidebar}
          <ResizeHandle
            ariaLabel="Resize sidebar"
            orientation="vertical"
            value={leftWidth}
            min={LEFT_MIN}
            max={LEFT_MAX}
            defaultValue={LEFT_DEFAULT}
            direction={1}
            className="resize-instrument-sidebar"
            onChange={props.onLeftWidthChange}
            onActiveChange={setColumnResizing}
          />
        </div>}
        <section className="instrument-desk-column relative col-start-3 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden bg-desk" ref={setDeskColumn}>
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
        {/* The rail stands beside the sidebar, so its own left inset comes from the sidebar's
            right padding; without a sidebar it has to pay for that gap itself. The "right"
            in the class name and the props is historical — the rail is a dock, not a side. */}
        <aside className={`instrument-right-rail relative col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden bg-desk p-2 ${props.leftVisible ? "pl-0" : ""} ${mode === "docked" ? "flex" : "hidden"}`} style={{ width: railWidth }} aria-label={activeRail.label} hidden={mode !== "docked"}>
          <ResizeHandle
            ariaLabel="Resize agent panel"
            orientation="vertical"
            value={railWidth}
            min={RIGHT_RAIL_MIN}
            max={railMax}
            defaultValue={RIGHT_RAIL_MIN}
            direction={1}
            className="resize-instrument-rail"
            onChange={props.onRightWidthChange}
            onActiveChange={setColumnResizing}
          />
          <div className="min-h-0 min-w-0 flex-1" ref={setDockedRailTarget} />
        </aside>
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
