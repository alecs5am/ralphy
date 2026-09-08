import { defineInstrumentScreenStates } from "@/shared/instrument/screen-state-registry";

export const canvasInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.canvas",
  states: ["loading", "ready", "empty", "error", "editing", "history"],
  rootMarker: "canvas-screen",
  landmarks: ["Working canvases"],
});
