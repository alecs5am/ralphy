import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type ReactPortal,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, House, PanelBottom, PanelLeft, PanelRight } from "lucide-react";

import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentRightRailMode, InstrumentRightRailOwner } from "./types";

const DOCK_WINDOW_MIN = 1_280;
const DOCK_DESK_MIN = 680;
const RIGHT_RAIL_WIDTH = 292;

export interface InstrumentScrollContextValue {
  element: HTMLElement | null;
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
  profile: ReactNode;
  routeScrollKey: string;
  leftVisible: boolean;
  rightPreference: boolean;
  rightOverlayOpen: boolean;
  bottomPanel?: ReactNode;
  bottomVisible: boolean;
  topChrome?: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack(): void;
    onForward(): void;
    onHome(): void;
    onToggleBottom(): void;
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
  const [railHost] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const host = document.createElement("div");
    host.setAttribute("class", "instrument-right-rail-host");
    return host;
  });
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

  const dockedDeskWidth = modeRef.current === "docked"
    ? dimensions.deskWidth
    : dimensions.deskWidth - RIGHT_RAIL_WIDTH;
  const dockEligible = dimensions.frameWidth >= DOCK_WINDOW_MIN && dockedDeskWidth >= DOCK_DESK_MIN && !props.bottomVisible;
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
  }), [deskElement, dimensions.deskHeight, dimensions.deskWidth, props.routeScrollKey]);

  const railContext = useMemo<InternalRightRailContextValue>(() => ({
    mode,
    owner: activeRail.owner,
    host: railHost,
    open: openRail,
    close: closeRail,
    register,
  }), [activeRail.owner, closeRail, mode, openRail, railHost, register]);

  return <ScrollContext.Provider value={scrollContext}>
    <RightRailContext.Provider value={railContext}>
      <div
        className={`instrument-shell col-span-3 row-start-1 grid h-full min-h-0 w-full min-w-0 overflow-hidden bg-desk grid-rows-[48px_minmax(0,1fr)] ${props.leftVisible ? "grid-cols-[240px_minmax(0,1fr)_auto]" : "grid-cols-[0_minmax(0,1fr)_auto]"}`}
        ref={frameRef}
        data-right-rail-mode={mode}
        data-instrument-native-inset="76"
      >
        <header
          className="instrument-top-row relative col-span-3 row-start-1 grid h-12 min-h-0 min-w-0 items-center bg-desk [-webkit-app-region:drag]"
          style={{ gridTemplateColumns: `${props.leftVisible ? 240 : 0}px minmax(0, 1fr) ${mode === "docked" ? RIGHT_RAIL_WIDTH : 0}px` }}
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
            <button className="main-header-home grid size-7 place-items-center rounded-full text-muted hover:bg-board hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" title="Projects" aria-label="Projects" onClick={props.topChrome.onHome}>
              <House size={15} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </div>}
          <div className="instrument-island-slot col-start-2 row-start-1 min-w-0 justify-self-center [-webkit-app-region:no-drag]">{props.island}</div>
          <div className="instrument-top-actions absolute inset-y-0 right-2 z-10 flex items-center gap-1 [-webkit-app-region:no-drag]">
            {props.topChrome && <>
              <button className={`grid size-7 place-items-center rounded-full hover:bg-board focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${props.bottomVisible ? "bg-board text-ink" : "text-muted"}`} type="button" title="Toggle bottom panel (⌘J)" aria-label="Toggle bottom panel" aria-pressed={props.bottomVisible} onClick={props.topChrome.onToggleBottom}>
                <PanelBottom size={15} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <button className={`grid size-7 place-items-center rounded-full hover:bg-board focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${mode === "closed" ? "text-muted" : "bg-board text-ink"}`} type="button" title="Toggle right panel (⌘R)" aria-label="Toggle right panel" aria-pressed={mode !== "closed"} onClick={(event) => { if (mode === "closed") openRail(event.currentTarget); else closeRail(); }}>
                <PanelRight size={15} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </>}
            {props.profile && <div className="instrument-profile-slot ml-1 [&_.instrument-profile-trigger]:size-8 [&_.instrument-profile-trigger]:justify-center [&_.instrument-profile-trigger]:overflow-hidden [&_.instrument-profile-trigger]:rounded-full [&_.instrument-profile-trigger]:p-0 [&_.instrument-profile-trigger]:text-ink [&_.instrument-profile-trigger:hover]:bg-board [&_.instrument-profile-trigger>span:last-child]:hidden">{props.profile}</div>}
          </div>
        </header>
        {props.leftVisible && <div className="instrument-left-stack col-start-1 row-start-2 flex h-full min-h-0 w-[240px] overflow-hidden bg-desk p-2 pt-0">{props.sidebar}</div>}
        <section className="instrument-desk-column col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden bg-desk">
          <div
            className="instrument-desk-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
            ref={setDeskElement}
            data-instrument-scroll-owner="instrument-desk-scroll"
            inert={mode === "overlay" || undefined}
            aria-hidden={mode === "overlay" || undefined}
          >
            {props.desk}
          </div>
          {props.bottomVisible && <div className="instrument-bottom-panel relative shrink-0">{props.bottomPanel}</div>}
        </section>
        <aside className={`instrument-right-rail col-start-3 row-start-2 w-[292px] min-h-0 min-w-0 overflow-hidden bg-desk p-2 pl-0 ${mode === "docked" ? "flex" : "hidden"}`} aria-label={activeRail.label} hidden={mode !== "docked"}>
          <div className="min-h-0 min-w-0 flex-1" ref={setDockedRailTarget} />
        </aside>
        <div className="instrument-rail-parking" ref={setRailParking} hidden inert>
        </div>
      </div>
      <InstrumentOverlay
        id="right-rail-sheet"
        open={mode === "overlay"}
        label={activeRail.label}
        description="Contextual controls for the active screen"
        opener={openerRef.current}
        onOpenChange={props.onRightOverlayOpenChange}
        localScroll
      >
        <div ref={setOverlayRailTarget} />
      </InstrumentOverlay>
      {railHost && createPortal(
        <div
          className="instrument-chat-rail-content"
          hidden={activeRail.owner !== "chat" && activeRail.owner !== "media-review"}
          inert={activeRail.owner !== "chat" && activeRail.owner !== "media-review" || undefined}
          onFocusCapture={(event) => { focusedRailElement.current = event.target as HTMLElement; }}
        >{props.chat}</div>,
        railHost,
        "instrument-persistent-right-rail",
      )}
    </RightRailContext.Provider>
  </ScrollContext.Provider>;
}
