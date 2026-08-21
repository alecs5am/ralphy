import {
  INSTRUMENT_OVERLAYS,
  SHARED_SELECT_OVERLAY_OWNERS,
  type InstrumentOverlayId,
  type InstrumentSharedSelectOwnerId,
} from "./overlay-registry";
import {
  CHAT_RAIL_ROUTE_KEYS,
  PRODUCTION_GLOBAL_OVERLAY_ROUTES,
  PRODUCTION_SCREEN_STATES,
  type ProductionGlobalOverlayId,
} from "./production-screen-states";
import type {
  InstrumentRouteKey,
  InstrumentScenarioState,
  InstrumentScreenStateDescriptor,
} from "./screen-state-registry";

export type InstrumentScenarioTheme = "light" | "dark";
export type InstrumentViewport = "1440x900" | "1280x800" | "1100x720";
export type InstrumentRightRailMode = "docked" | "overlay" | "closed";
export type InstrumentRightRailOwner = "chat" | "media-review" | "shared-inspector" | "calendar-inspector" | "activity-inspector";

export const REQUIRED_SCENARIO_THEMES = ["light", "dark"] as const;
export const REQUIRED_SCENARIO_VIEWPORTS = ["1440x900", "1280x800", "1100x720"] as const;

export interface InstrumentPanelSetup {
  leftVisible: boolean;
  rightPreference: boolean;
  rightOverlayOpen: boolean;
  bottomVisible: boolean;
}

export interface InstrumentScenarioCoverageException {
  omitted: readonly `${InstrumentScenarioTheme}@${InstrumentViewport}`[];
  reason: string;
  review: { reviewer: string; decision: "approved" };
}

export interface InstrumentScenario {
  id: string;
  routeKey: InstrumentRouteKey;
  state: InstrumentScenarioState;
  fixtureId: string;
  rootMarker: string;
  landmarks: readonly string[];
  railOwner: InstrumentRightRailOwner | null;
  overlay: InstrumentOverlayId | null;
  overlayOwner: InstrumentSharedSelectOwnerId | null;
  focusEntry: string | null;
  focusReturn: string | null;
  scrollOwner: "desk" | "overlay";
  themes: readonly InstrumentScenarioTheme[];
  viewports: readonly InstrumentViewport[];
  expectedRailMode: Readonly<Record<InstrumentViewport, InstrumentRightRailMode>>;
  panelSetup: Readonly<Record<InstrumentViewport, InstrumentPanelSetup>>;
  coverageException: InstrumentScenarioCoverageException | null;
  journeys: readonly ("keyboard" | "reduced-motion" | "live-region")[];
}

type LocalOverlayId = Exclude<InstrumentOverlayId, "shared-select-menu" | ProductionGlobalOverlayId>;
type OverlayTarget = { routeKey: InstrumentRouteKey; state: InstrumentScenarioState; railOwner?: InstrumentRightRailOwner };

const LOCAL_OVERLAY_TARGETS = {
  "root-picker": { routeKey: "startup.welcome", state: "ready" },
  "migration-recovery": { routeKey: "startup.migration", state: "unavailable" },
  "app-alert": { routeKey: "startup.library", state: "error" },
  "profile-menu": { routeKey: "startup.library", state: "ready" },
  settings: { routeKey: "settings.general", state: "ready" },
  "dynamic-island": { routeKey: "startup.library", state: "ready" },
  "right-rail-sheet": { routeKey: "startup.library", state: "ready", railOwner: "chat" },
  "workspace-account-detail": { routeKey: "workspace.overview", state: "ready" },
  "workspace-unit-outcome-detail": { routeKey: "workspace.overview", state: "ready" },
  "workspace-evidence-detail": { routeKey: "workspace.overview", state: "ready" },
  "shared-inspector": { routeKey: "workspace.shared", state: "ready", railOwner: "shared-inspector" },
  "shared-viewer": { routeKey: "workspace.shared", state: "ready" },
  "shared-workflow": { routeKey: "workspace.shared", state: "ready" },
  "memory-recall": { routeKey: "workspace.memory", state: "selected" },
  "memory-editor": { routeKey: "workspace.memory", state: "selected" },
  "memory-history": { routeKey: "workspace.memory", state: "selected" },
  "memory-confirm": { routeKey: "workspace.memory", state: "selected" },
  "calendar-filter": { routeKey: "workspace.calendar", state: "ready" },
  "calendar-drawer": { routeKey: "workspace.calendar", state: "ready" },
  "calendar-inspector": { routeKey: "workspace.calendar", state: "selected", railOwner: "calendar-inspector" },
  "calendar-schedule": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-unit-picker": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-date-popover": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-time-popover": { routeKey: "workspace.calendar", state: "scheduling" },
  "calendar-platform-settings": { routeKey: "workspace.calendar", state: "ready" },
  "calendar-account-detail": { routeKey: "workspace.calendar", state: "selected" },
  "calendar-reconnect": { routeKey: "workspace.calendar", state: "selected" },
  "document-editor": { routeKey: "project.documents", state: "editing" },
  "document-viewer": { routeKey: "project.documents", state: "selected" },
  "document-conflict": { routeKey: "project.documents", state: "conflict" },
  "media-viewer": { routeKey: "project.media", state: "viewer", railOwner: "media-review" },
  "media-context-menu": { routeKey: "project.media", state: "selected", railOwner: "media-review" },
  "mock-needs-work": { routeKey: "project.media", state: "selected", railOwner: "media-review" },
  "unit-viewer": { routeKey: "project.units", state: "viewer" },
  "run-inspector": { routeKey: "project.activity", state: "selected", railOwner: "activity-inspector" },
  "marketplace-detail": { routeKey: "marketplace.detail", state: "ready" },
  "target-chooser": { routeKey: "marketplace.detail", state: "ready" },
  terminal: { routeKey: "startup.library", state: "ready" },
} as const satisfies Record<LocalOverlayId, OverlayTarget>;

const descriptorByRoute = new Map(PRODUCTION_SCREEN_STATES.map((descriptor) => [descriptor.routeKey, descriptor]));
const chatRoutes = new Set<InstrumentRouteKey>(CHAT_RAIL_ROUTE_KEYS);
const railOverlaysAtNarrow = new Set<InstrumentOverlayId>([
  "right-rail-sheet", "shared-inspector", "calendar-inspector", "run-inspector",
  ...Object.keys(PRODUCTION_GLOBAL_OVERLAY_ROUTES).filter((id) => id.startsWith("agent-chat-")) as ProductionGlobalOverlayId[],
]);

function descriptorFor(routeKey: InstrumentRouteKey): InstrumentScreenStateDescriptor {
  const descriptor = descriptorByRoute.get(routeKey);
  if (!descriptor) throw new Error(`Missing production descriptor for ${routeKey}`);
  return descriptor;
}

function routeScenarioId(routeKey: InstrumentRouteKey, state: InstrumentScenarioState) {
  const route = routeKey.startsWith("project.") ? routeKey.slice("project.".length) : routeKey;
  return `${route}.${state}`;
}

function routeRailOwner(routeKey: InstrumentRouteKey, state: InstrumentScenarioState): InstrumentRightRailOwner | null {
  if (routeKey === "project.media" && ["ready", "partial", "selected", "viewer"].includes(state)) return "media-review";
  if (routeKey === "workspace.calendar" && state === "selected") return "calendar-inspector";
  if (routeKey === "project.activity" && state === "selected") return "activity-inspector";
  return chatRoutes.has(routeKey) ? "chat" : null;
}

function panelsFor(railOwner: InstrumentRightRailOwner | null, overlay: InstrumentOverlayId | null) {
  const hasRail = railOwner !== null;
  const narrowOverlay = overlay !== null && railOverlaysAtNarrow.has(overlay);
  const bottomVisible = overlay === "terminal";
  const panelSetup: Record<InstrumentViewport, InstrumentPanelSetup> = {
    "1440x900": { leftVisible: true, rightPreference: hasRail, rightOverlayOpen: false, bottomVisible },
    "1280x800": { leftVisible: true, rightPreference: hasRail, rightOverlayOpen: false, bottomVisible },
    "1100x720": { leftVisible: true, rightPreference: hasRail, rightOverlayOpen: narrowOverlay, bottomVisible },
  };
  const expectedRailMode: Record<InstrumentViewport, InstrumentRightRailMode> = {
    "1440x900": hasRail ? "docked" : "closed",
    "1280x800": hasRail ? "docked" : "closed",
    "1100x720": narrowOverlay ? "overlay" : "closed",
  };
  return { panelSetup, expectedRailMode };
}

function scenario(input: {
  id: string;
  routeKey: InstrumentRouteKey;
  state: InstrumentScenarioState;
  overlay?: InstrumentOverlayId;
  overlayOwner?: InstrumentSharedSelectOwnerId;
  railOwner?: InstrumentRightRailOwner | null;
  coverageException?: InstrumentScenarioCoverageException;
}): InstrumentScenario {
  const descriptor = descriptorFor(input.routeKey);
  if (!descriptor.states.includes(input.state)) throw new Error(`${input.routeKey} does not declare ${input.state}`);
  const overlay = input.overlay ?? null;
  const overlayOwner = input.overlayOwner ?? null;
  const railOwner = input.railOwner === undefined ? routeRailOwner(input.routeKey, input.state) : input.railOwner;
  const panels = panelsFor(railOwner, overlay);
  const overlaySelector = overlay === null ? null : `[data-instrument-overlay="${overlay}"]`;
  const journeys: InstrumentScenario["journeys"] = overlay === null
    ? (input.id === "media.ready" ? ["keyboard", "reduced-motion", "live-region"] : input.state === "error" ? ["live-region"] : [])
    : overlay === "dynamic-island" ? ["keyboard", "reduced-motion", "live-region"] : ["keyboard"];
  return {
    id: input.id,
    routeKey: input.routeKey,
    state: input.state,
    fixtureId: `instrument-test-fixture:${input.id}`,
    rootMarker: descriptor.rootMarker,
    landmarks: descriptor.landmarks,
    railOwner,
    overlay,
    overlayOwner,
    focusEntry: overlaySelector,
    focusReturn: overlay === null ? null : `[data-instrument-overlay-opener="${overlay}"]`,
    scrollOwner: overlay !== null && INSTRUMENT_OVERLAYS[overlay].kind !== "rail" ? "overlay" : "desk",
    themes: REQUIRED_SCENARIO_THEMES,
    viewports: REQUIRED_SCENARIO_VIEWPORTS,
    ...panels,
    coverageException: input.coverageException ?? null,
    journeys,
  };
}

const routeStateScenarios = PRODUCTION_SCREEN_STATES.flatMap((descriptor) => descriptor.states.map((state) => scenario({
  id: routeScenarioId(descriptor.routeKey, state),
  routeKey: descriptor.routeKey,
  state,
})));

const localOverlayScenarios = (Object.keys(INSTRUMENT_OVERLAYS) as InstrumentOverlayId[])
  .filter((id): id is LocalOverlayId => id !== "shared-select-menu" && !(id in PRODUCTION_GLOBAL_OVERLAY_ROUTES))
  .map((overlay) => {
    const target: OverlayTarget = LOCAL_OVERLAY_TARGETS[overlay];
    const narrowSheetOnly = overlay === "right-rail-sheet" ? {
      omitted: ["light@1440x900", "light@1280x800", "dark@1440x900", "dark@1280x800"],
      reason: "The right-rail sheet exists only below the docking threshold; wide layouts use the docked rail.",
      review: { reviewer: "Nothing OS plan review", decision: "approved" },
    } as const satisfies InstrumentScenarioCoverageException : undefined;
    return scenario({
      id: `overlay.${overlay}.${target.routeKey}`,
      routeKey: target.routeKey,
      state: target.state,
      overlay,
      railOwner: target.railOwner,
      coverageException: narrowSheetOnly,
    });
  });

function sharedRoutes(owner: InstrumentSharedSelectOwnerId): readonly InstrumentRouteKey[] {
  const scope = SHARED_SELECT_OVERLAY_OWNERS[owner].routeScope;
  return scope.kind === "exact"
    ? scope.routeKeys
    : PRODUCTION_SCREEN_STATES.map(({ routeKey }) => routeKey).filter((routeKey) => routeKey.startsWith(scope.prefix));
}

function preferredState(routeKey: InstrumentRouteKey): InstrumentScenarioState {
  const states = descriptorFor(routeKey).states;
  return states.includes("ready") ? "ready" : states[0]!;
}

const sharedOverlayScenarios = (Object.keys(SHARED_SELECT_OVERLAY_OWNERS) as InstrumentSharedSelectOwnerId[])
  .flatMap((overlayOwner) => sharedRoutes(overlayOwner).map((routeKey) => scenario({
    id: `overlay.shared-select-menu.${overlayOwner}.${routeKey}`,
    routeKey,
    state: preferredState(routeKey),
    overlay: "shared-select-menu",
    overlayOwner,
  })));

const globalOverlayScenarios = (Object.entries(PRODUCTION_GLOBAL_OVERLAY_ROUTES) as [ProductionGlobalOverlayId, readonly InstrumentRouteKey[]][])
  .flatMap(([overlay, routeKeys]) => routeKeys.map((routeKey) => scenario({
    id: `overlay.${overlay}.${routeKey}`,
    routeKey,
    state: preferredState(routeKey),
    overlay,
    railOwner: overlay.startsWith("agent-chat-") ? "chat" : undefined,
  })));

export const INSTRUMENT_SCENARIOS: readonly InstrumentScenario[] = [
  ...routeStateScenarios,
  ...localOverlayScenarios,
  ...sharedOverlayScenarios,
  ...globalOverlayScenarios,
];

function valuesMissingFrom(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => !rightSet.has(value)))].sort();
}

function tuple(...parts: readonly (string | null)[]) {
  return parts.map((part) => part ?? "-").join("::");
}

function requireEqualSets(label: string, required: readonly string[], actual: readonly string[]) {
  const missing = valuesMissingFrom(required, actual);
  const extra = valuesMissingFrom(actual, required);
  if (missing.length || extra.length) throw new Error(`${label}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
}

export function assertInstrumentScenarioCompleteness(): void {
  const requiredRouteStates = PRODUCTION_SCREEN_STATES.flatMap(({ routeKey, states }) => states.map((state) => tuple(routeKey, state)));
  const actualRouteStates = INSTRUMENT_SCENARIOS.map(({ routeKey, state }) => tuple(routeKey, state));
  requireEqualSets("route/state coverage", requiredRouteStates, actualRouteStates);

  const requiredOverlays = Object.keys(INSTRUMENT_OVERLAYS);
  const actualOverlays = INSTRUMENT_SCENARIOS.flatMap(({ overlay }) => overlay === null ? [] : [overlay]);
  requireEqualSets("overlay coverage", requiredOverlays, actualOverlays);

  const requiredShared = (Object.keys(SHARED_SELECT_OVERLAY_OWNERS) as InstrumentSharedSelectOwnerId[])
    .flatMap((owner) => sharedRoutes(owner).map((routeKey) => tuple(routeKey, "shared-select-menu", owner)));
  const actualShared = INSTRUMENT_SCENARIOS
    .filter(({ overlay }) => overlay === "shared-select-menu")
    .map(({ routeKey, overlay, overlayOwner }) => tuple(routeKey, overlay, overlayOwner));
  requireEqualSets("shared overlay owner coverage", requiredShared, actualShared);

  const requiredGlobal = (Object.entries(PRODUCTION_GLOBAL_OVERLAY_ROUTES) as [ProductionGlobalOverlayId, readonly InstrumentRouteKey[]][])
    .flatMap(([overlay, routeKeys]) => routeKeys.map((routeKey) => tuple(routeKey, overlay, null)));
  const globalIds = new Set(Object.keys(PRODUCTION_GLOBAL_OVERLAY_ROUTES));
  const actualGlobal = INSTRUMENT_SCENARIOS
    .filter(({ overlay }) => overlay !== null && globalIds.has(overlay))
    .map(({ routeKey, overlay, overlayOwner }) => tuple(routeKey, overlay, overlayOwner));
  requireEqualSets("global overlay route coverage", requiredGlobal, actualGlobal);

  const duplicateIds = INSTRUMENT_SCENARIOS.map(({ id }) => id).filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`duplicate scenario IDs: ${duplicateIds.join(", ")}`);
  for (const current of INSTRUMENT_SCENARIOS) {
    if (current.overlay !== "shared-select-menu" && current.overlayOwner !== null) throw new Error(`${current.id} has an unexpected shared overlay owner`);
    if (current.coverageException === null
      && (current.themes.join() !== REQUIRED_SCENARIO_THEMES.join() || current.viewports.join() !== REQUIRED_SCENARIO_VIEWPORTS.join())) {
      throw new Error(`${current.id} does not cover the locked theme/viewport matrix`);
    }
  }
}

export function expandInstrumentScenarioCases(scenarios: readonly InstrumentScenario[]): readonly {
  key: string;
  scenarioId: string;
  theme: InstrumentScenarioTheme;
  viewport: InstrumentViewport;
}[] {
  return scenarios.flatMap((current) => current.themes.flatMap((theme) => current.viewports.flatMap((viewport) => (
    current.coverageException?.omitted.includes(`${theme}@${viewport}`) ? [] : [{
      key: `${current.id}__${theme}__${viewport}`,
      scenarioId: current.id,
      theme,
      viewport,
    }]
  ))));
}

assertInstrumentScenarioCompleteness();
