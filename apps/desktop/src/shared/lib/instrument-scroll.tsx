import { createContext, useContext, type ReactNode } from "react";

/**
 * The desk's scroller, published to whatever is inside it.
 *
 * This context lived in the shell that provides it, which put the shell under every widget and
 * page that only wanted to read the scroller -- a header that floats a control, a grid that
 * virtualizes against the desk rather than against itself. A React context is infrastructure:
 * the provider is a layout decision, the consumer hook is not.
 */
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

const ScrollContext = createContext<InstrumentScrollContextValue | null>(null);

export function InstrumentScrollProvider({ value, children }: { value: InstrumentScrollContextValue; children: ReactNode }) {
  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}

export function useInstrumentScroll(): InstrumentScrollContextValue {
  const value = useContext(ScrollContext);
  if (!value) throw new Error("useInstrumentScroll must be used inside InstrumentShell");
  return value;
}

export function useOptionalInstrumentScroll(): InstrumentScrollContextValue | null {
  return useContext(ScrollContext);
}
