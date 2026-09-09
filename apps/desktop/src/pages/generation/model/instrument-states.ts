import { defineInstrumentScreenStates } from "@/shared/instrument/screen-state-registry";

export const GENERATION_SCREEN_STATES = defineInstrumentScreenStates({
  routeKey: "workspace.generation", states: ["loading", "ready", "empty", "error", "editing", "history"],
  rootMarker: "generation-screen", landmarks: ["Create studio"],
});
