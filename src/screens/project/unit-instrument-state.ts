import { defineInstrumentScreenStates } from "../../instrument/screen-state-registry";

export const unitsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "project.units",
  states: ["loading", "ready", "empty", "partial", "error", "selected", "viewer", "conflict"],
  rootMarker: "project-units",
  landmarks: ["Units", "Unit status filter"],
} as const);
