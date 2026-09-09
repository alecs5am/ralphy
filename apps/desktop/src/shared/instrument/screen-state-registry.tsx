import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * What a screen declares about itself: which route it is, which states it can be in, and which
 * landmarks a reader can find in it.
 *
 * The route *key* is a plain string here on purpose. The union of every key the app has is
 * `InstrumentRouteKey` in `app/instrument/routes.ts`, because only the composition root is
 * allowed to know every route; this registry sits under every page that calls it and so cannot
 * name them. A key that does not belong to the union is caught where the union lives -- the
 * scenario catalogue maps route to descriptor, and its coverage is asserted exhaustively.
 */
export type InstrumentScenarioState =
  | "restoring" | "loading" | "ready" | "empty" | "offline" | "partial" | "unavailable" | "error"
  | "selected" | "disabled" | "editing" | "conflict" | "history" | "viewer" | "playing" | "scheduling" | "mock-review";

export interface InstrumentScreenStateDescriptor<Route extends string = string> {
  /** One key per screen. The union of every key the app has is `InstrumentRouteKey` in `app`. */
  routeKey: Route;
  states: readonly InstrumentScenarioState[];
  rootMarker: string;
  landmarks: readonly string[];
}

export function defineInstrumentScreenStates<const Descriptor extends InstrumentScreenStateDescriptor>(descriptor: Descriptor): Descriptor {
  return descriptor;
}

export function InstrumentScreenRoot({ descriptor, state, children }: {
  descriptor: InstrumentScreenStateDescriptor;
  state: InstrumentScenarioState;
  children: ReactNode;
}): ReactElement {
  if (process.env.NODE_ENV !== "production" && !descriptor.states.includes(state)) {
    throw new Error(`${descriptor.routeKey} does not declare instrument state ${state}`);
  }
  const markers = {
    "data-instrument-route": descriptor.routeKey,
    "data-instrument-state": state,
    "data-instrument-root": descriptor.rootMarker,
  };
  return isValidElement(children) && typeof children.type === "string"
    ? cloneElement(children as ReactElement<Record<string, unknown>>, markers)
    : <div {...markers} style={{ display: "contents" }}>{children}</div>;
}
