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
  onToggleLeft(): void;
  onToggleRightPreference(): void;
  onRightOverlayOpenChange(open: boolean): void;
}

interface RailRegistration {
  token: symbol;
  owner: InstrumentRightRailOwner;
  label: string;
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

export function useInstrumentRightRail(): InstrumentRightRailContextValue {
  const value = useContext(RightRailContext);
  if (!value) throw new Error("useInstrumentRightRail must be used inside InstrumentShell");
  return value;
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
  const [railHost, setRailHost] = useState<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ frameWidth: 0, deskWidth: 0, deskHeight: 0 });
  const [activeRail, setActiveRail] = useState<{ owner: InstrumentRightRailOwner; label: string }>({ owner: "chat", label: "Agent chat" });
  const registrations = useRef<RailRegistration[]>([]);
  const openerRef = useRef<HTMLElement | null>(null);
  const offsets = useRef(new Map<string, number>());
  const previousRouteKey = useRef(props.routeScrollKey);
  const modeRef = useRef<InstrumentRightRailMode>("closed");

  const dockedDeskWidth = modeRef.current === "docked"
    ? dimensions.deskWidth
    : dimensions.deskWidth - RIGHT_RAIL_WIDTH;
  const dockEligible = dimensions.frameWidth >= DOCK_WINDOW_MIN && dockedDeskWidth >= DOCK_DESK_MIN;
  const mode = resolveRightRailMode({
    dockEligible,
    preferenceOpen: props.rightPreference,
    overlayOpen: props.rightOverlayOpen,
  });
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
    if (!deskElement || previousRouteKey.current === props.routeScrollKey) return;
    offsets.current.set(previousRouteKey.current, deskElement.scrollTop);
    previousRouteKey.current = props.routeScrollKey;
    deskElement.scrollTo({ top: offsets.current.get(props.routeScrollKey) ?? 0 });
  }, [deskElement, props.routeScrollKey]);

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

  const defaultChat = activeRail.owner === "chat" ? props.chat : null;
  const railSurface = <div className="instrument-right-rail-host" ref={setRailHost}>{defaultChat}</div>;

  return <ScrollContext.Provider value={scrollContext}>
    <RightRailContext.Provider value={railContext}>
      <div
        className={`instrument-shell${props.leftVisible ? "" : " is-left-collapsed"}`}
        ref={frameRef}
        data-right-rail-mode={mode}
        data-instrument-native-inset="76"
      >
        <div className="instrument-native-inset" aria-hidden="true" />
        {props.leftVisible && <div className="instrument-left-stack">{props.sidebar}</div>}
        <section className="instrument-desk-column">
          <header className="instrument-top-row">
            <div className="instrument-island-slot">{props.island}</div>
            {props.profile && <div className="instrument-profile-slot">{props.profile}</div>}
          </header>
          <div
            className="instrument-desk-scroll"
            ref={setDeskElement}
            data-instrument-scroll-owner="instrument-desk-scroll"
            inert={mode === "overlay" || undefined}
            aria-hidden={mode === "overlay" || undefined}
          >
            {props.desk}
          </div>
          {props.bottomVisible && <div className="instrument-bottom-panel">{props.bottomPanel}</div>}
        </section>
        {mode === "docked" && <aside className="instrument-right-rail" aria-label={activeRail.label}>{railSurface}</aside>}
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
        {railSurface}
      </InstrumentOverlay>
    </RightRailContext.Provider>
  </ScrollContext.Provider>;
}
