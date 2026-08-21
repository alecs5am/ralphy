import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import type { ProjectView } from "../components/ProjectControls";
import type {
  MarketplaceCategory,
  MarketplaceLibrarySection,
} from "../state/marketplace-navigation";
import type { WorkspacePage } from "../state/workbench";

export type InstrumentRouteKey =
  | `startup.${"welcome" | "library" | "migration"}`
  | `workspace.${WorkspacePage}`
  | `project.${ProjectView}`
  | `settings.${"general" | "profile" | "appearance" | "providers" | "about"}`
  | `marketplace.${"discover" | "results" | "collection" | "detail"}`
  | `marketplace.category.${MarketplaceCategory}`
  | `marketplace.library.${MarketplaceLibrarySection}`
  | `marketplace.unavailable-detail.${"prompts" | "components" | "skills"}`;

export type InstrumentScenarioState =
  | "restoring" | "loading" | "ready" | "empty" | "offline" | "partial" | "unavailable" | "error"
  | "selected" | "disabled" | "editing" | "conflict" | "history" | "viewer" | "playing" | "scheduling" | "mock-review";

export interface InstrumentScreenStateDescriptor<Route extends InstrumentRouteKey = InstrumentRouteKey> {
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
