import { createContext, useContext, useLayoutEffect, type ReactNode, type ReactPortal } from "react";
import { createPortal } from "react-dom";

import type { InstrumentRightRailMode, InstrumentRightRailOwner } from "../instrument/types";

/**
 * The shell's right column, published to whatever wants to put something in it.
 *
 * Same reason as the scroll context: the provider is the layout's decision, but a page that
 * owns the rail's contents -- the chat, the shared-library inspector -- only reads it, and
 * making those pages depend on the layout to do so inverts the dependency.
 *
 * `register` and `host` are internal: only the shell fills them in. A caller sees the mode, who
 * owns the rail, and the portal that writes into it.
 */
export interface InstrumentRightRailContextValue {
  mode: InstrumentRightRailMode;
  owner: InstrumentRightRailOwner;
  open(opener: HTMLElement | null): void;
  close(): void;
}

export interface InstrumentRightRailProviderValue extends InstrumentRightRailContextValue {
  host: HTMLElement | null;
  register(owner: InstrumentRightRailOwner, label: string): () => void;
}

const RightRailContext = createContext<InstrumentRightRailProviderValue | null>(null);

export function InstrumentRightRailProvider({ value, children }: { value: InstrumentRightRailProviderValue; children: ReactNode }) {
  return <RightRailContext.Provider value={value}>{children}</RightRailContext.Provider>;
}

export function useInstrumentRightRail(): InstrumentRightRailContextValue {
  const value = useContext(RightRailContext);
  if (!value) throw new Error("useInstrumentRightRail must be used inside InstrumentShell");
  return value;
}

export function useOptionalInstrumentRightRail(): InstrumentRightRailContextValue | null {
  return useContext(RightRailContext);
}

/** Writes into the rail, but only while the rail is open and this owner is the one holding it. */
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

/**
 * Docked when the column has the room for it, an overlay when it does not.
 *
 * A dock is a preference the operator sets; an overlay is a thing they open and close. Neither
 * reads the other's flag, so a narrow window cannot leave the rail stuck open.
 */
export function resolveRightRailMode(input: {
  dockEligible: boolean;
  preferenceOpen: boolean;
  overlayOpen: boolean;
}): InstrumentRightRailMode {
  if (input.dockEligible) return input.preferenceOpen ? "docked" : "closed";
  return input.overlayOpen ? "overlay" : "closed";
}
