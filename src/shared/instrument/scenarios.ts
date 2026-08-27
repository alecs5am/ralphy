import {
  INSTRUMENT_OVERLAYS,
  SHARED_SELECT_OVERLAY_OWNERS,
  type InstrumentOverlayId,
  type InstrumentSharedSelectOwnerId,
} from "./overlay-registry";
import {
  CHAT_RAIL_ROUTE_KEYS,
  PRODUCTION_GLOBAL_OVERLAY_ROUTES,
  PRODUCTION_LOCAL_OVERLAY_TARGETS,
  PRODUCTION_SCREEN_STATES,
  type ProductionGlobalOverlayId,
  type ProductionLocalOverlayId,
} from "./production-screen-states";
import type {
  InstrumentRouteKey,
  InstrumentScenarioState,
  InstrumentScreenStateDescriptor,
} from "./screen-state-registry";

export type InstrumentScenarioTheme = "light" | "dark";
export type InstrumentViewport = "1440x900" | "1280x800" | "1100x720";
export type InstrumentRightRailMode = "docked" | "overlay" | "closed";
export type InstrumentRightRailOwner = "chat" | "shared-inspector";

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

const descriptorByRoute = new Map(PRODUCTION_SCREEN_STATES.map((descriptor) => [descriptor.routeKey, descriptor]));
const chatRoutes = new Set<InstrumentRouteKey>(CHAT_RAIL_ROUTE_KEYS);
const railOverlaysAtNarrow = new Set<InstrumentOverlayId>([
  "right-rail-sheet", "shared-inspector", "calendar-inspector", "run-inspector",
  ...Object.keys(PRODUCTION_GLOBAL_OVERLAY_ROUTES).filter((id) => id.startsWith("agent-chat-")) as ProductionGlobalOverlayId[],
]);
const APPROVED_SCENARIO_COVERAGE_EXCEPTIONS = {
  "overlay.right-rail-sheet.startup.library": {
    omitted: ["light@1440x900", "light@1280x800", "dark@1440x900", "dark@1280x800"],
    reason: "The right-rail sheet exists only below the docking threshold; wide layouts use the docked rail.",
    review: { reviewer: "Nothing OS plan review", decision: "approved" },
  },
} as const satisfies Readonly<Record<string, InstrumentScenarioCoverageException>>;

function descriptorFor(routeKey: InstrumentRouteKey): InstrumentScreenStateDescriptor {
  const descriptor = descriptorByRoute.get(routeKey);
  if (!descriptor) throw new Error(`Missing production descriptor for ${routeKey}`);
  return descriptor;
}

function routeScenarioId(routeKey: InstrumentRouteKey, state: InstrumentScenarioState) {
  const route = routeKey.startsWith("project.") ? routeKey.slice("project.".length) : routeKey;
  return `${route}.${state}`;
}

/* Only the chat and the shared library's inspector dock into the rail now. Media review, the
   calendar inspector and the run inspector each used to claim it, which is what made a right-edge
   sidebar the app's second answer to "show me this one thing"; they are a context menu, a modal and
   a floating panel now, and no route opens the rail on the operator's behalf. */
function routeRailOwner(routeKey: InstrumentRouteKey, state: InstrumentScenarioState): InstrumentRightRailOwner | null {
  if (routeKey === "workspace.shared" && state === "selected") return "shared-inspector";
  return chatRoutes.has(routeKey) ? "chat" : null;
}

function panelsFor(railOwner: InstrumentRightRailOwner | null, overlay: InstrumentOverlayId | null) {
  const hasRail = railOwner !== null;
  const narrowOverlay = overlay !== null && railOverlaysAtNarrow.has(overlay);
  const bottomVisible = false;
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
    fixtureId: [
      "instrument-test-fixture",
      encodeURIComponent(input.routeKey),
      input.state,
      encodeURIComponent(input.id),
      overlay ?? "-",
      overlayOwner ?? "-",
    ].join(":"),
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
  .filter((id): id is ProductionLocalOverlayId => id !== "shared-select-menu" && !(id in PRODUCTION_GLOBAL_OVERLAY_ROUTES))
  .map((overlay) => {
    const target = PRODUCTION_LOCAL_OVERLAY_TARGETS[overlay];
    const id = `overlay.${overlay}.${target.routeKey}`;
    return scenario({
      id,
      routeKey: target.routeKey,
      state: target.state,
      overlay,
      railOwner: overlay === "shared-inspector" ? "shared-inspector" : undefined,
      coverageException: APPROVED_SCENARIO_COVERAGE_EXCEPTIONS[id as keyof typeof APPROVED_SCENARIO_COVERAGE_EXCEPTIONS],
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
export const MARKETPLACE_SCENARIOS = INSTRUMENT_SCENARIOS.filter(({ routeKey }) => routeKey.startsWith("marketplace."));
export const MARKETPLACE_SCENARIO_IDS = MARKETPLACE_SCENARIOS.map(({ id }) => id);

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

function requireEqualSequence(label: string, expected: readonly string[], actual: readonly string[]) {
  const mismatch = Math.max(expected.length, actual.length) === 0
    ? -1
    : Array.from({ length: Math.max(expected.length, actual.length) }, (_, index) => index)
      .find((index) => expected[index] !== actual[index]) ?? -1;
  if (mismatch !== -1) throw new Error(`${label}: mismatch at ${mismatch}; expected ${expected[mismatch] ?? "<end>"}, received ${actual[mismatch] ?? "<end>"}`);
}

function canonicalScenarioIds(): readonly string[] {
  return [
    ...PRODUCTION_SCREEN_STATES.flatMap(({ routeKey, states }) => states.map((state) => (
      `${routeKey.startsWith("project.") ? routeKey.slice("project.".length) : routeKey}.${state}`
    ))),
    ...Object.entries(PRODUCTION_LOCAL_OVERLAY_TARGETS).map(([overlay, target]) => `overlay.${overlay}.${target.routeKey}`),
    ...(Object.keys(SHARED_SELECT_OVERLAY_OWNERS) as InstrumentSharedSelectOwnerId[])
      .flatMap((owner) => sharedRoutes(owner).map((routeKey) => `overlay.shared-select-menu.${owner}.${routeKey}`)),
    ...(Object.entries(PRODUCTION_GLOBAL_OVERLAY_ROUTES) as [ProductionGlobalOverlayId, readonly InstrumentRouteKey[]][])
      .flatMap(([overlay, routeKeys]) => routeKeys.map((routeKey) => `overlay.${overlay}.${routeKey}`)),
  ];
}

function assertCoverageExceptions(scenarios: readonly InstrumentScenario[]) {
  const validPairs = new Set(REQUIRED_SCENARIO_THEMES.flatMap((theme) => (
    REQUIRED_SCENARIO_VIEWPORTS.map((viewport) => `${theme}@${viewport}`)
  )));
  for (const [id, exception] of Object.entries(APPROVED_SCENARIO_COVERAGE_EXCEPTIONS)) {
    if (!exception.omitted.length
      || new Set(exception.omitted).size !== exception.omitted.length
      || exception.omitted.some((pair) => !validPairs.has(pair))
      || !exception.reason.trim()
      || !exception.review.reviewer.trim()
      || exception.review.decision !== "approved") throw new Error(`coverage exception allowlist is invalid for ${id}`);
  }
  const actual = Object.fromEntries(scenarios
    .filter(({ coverageException }) => coverageException !== null)
    .map(({ id, coverageException }) => [id, coverageException]));
  if (JSON.stringify(actual) !== JSON.stringify(APPROVED_SCENARIO_COVERAGE_EXCEPTIONS)) {
    throw new Error("coverage exception records do not match the immutable reviewed allowlist");
  }
}

export function assertInstrumentScenarioCompleteness(scenarios: readonly InstrumentScenario[] = INSTRUMENT_SCENARIOS): void {
  const requiredRouteStates = PRODUCTION_SCREEN_STATES.flatMap(({ routeKey, states }) => states.map((state) => tuple(routeKey, state)));
  const actualRouteStates = scenarios.map(({ routeKey, state }) => tuple(routeKey, state));
  requireEqualSets("route/state coverage", requiredRouteStates, actualRouteStates);

  const requiredOverlays = Object.keys(INSTRUMENT_OVERLAYS);
  const actualOverlays = scenarios.flatMap(({ overlay }) => overlay === null ? [] : [overlay]);
  requireEqualSets("overlay coverage", requiredOverlays, actualOverlays);

  const requiredShared = (Object.keys(SHARED_SELECT_OVERLAY_OWNERS) as InstrumentSharedSelectOwnerId[])
    .flatMap((owner) => sharedRoutes(owner).map((routeKey) => tuple(routeKey, "shared-select-menu", owner)));
  const actualShared = scenarios
    .filter(({ overlay }) => overlay === "shared-select-menu")
    .map(({ routeKey, overlay, overlayOwner }) => tuple(routeKey, overlay, overlayOwner));
  requireEqualSets("shared overlay owner coverage", requiredShared, actualShared);

  const requiredGlobal = (Object.entries(PRODUCTION_GLOBAL_OVERLAY_ROUTES) as [ProductionGlobalOverlayId, readonly InstrumentRouteKey[]][])
    .flatMap(([overlay, routeKeys]) => routeKeys.map((routeKey) => tuple(routeKey, overlay, null)));
  const globalIds = new Set(Object.keys(PRODUCTION_GLOBAL_OVERLAY_ROUTES));
  const actualGlobal = scenarios
    .filter(({ overlay }) => overlay !== null && globalIds.has(overlay))
    .map(({ routeKey, overlay, overlayOwner }) => tuple(routeKey, overlay, overlayOwner));
  requireEqualSets("global overlay route coverage", requiredGlobal, actualGlobal);

  const ids = scenarios.map(({ id }) => id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`duplicate scenario IDs: ${duplicateIds.join(", ")}`);
  requireEqualSequence("canonical scenario IDs", canonicalScenarioIds(), ids);
  assertCoverageExceptions(scenarios);
  for (const current of scenarios) {
    if (current.overlay !== "shared-select-menu" && current.overlayOwner !== null) throw new Error(`${current.id} has an unexpected shared overlay owner`);
    if (current.themes.join() !== REQUIRED_SCENARIO_THEMES.join() || current.viewports.join() !== REQUIRED_SCENARIO_VIEWPORTS.join()) {
      throw new Error(`${current.id} does not cover the locked theme/viewport matrix`);
    }
  }
  const expectedCaseKeys = canonicalScenarioIds().flatMap((id) => REQUIRED_SCENARIO_THEMES.flatMap((theme) => (
    REQUIRED_SCENARIO_VIEWPORTS.flatMap((viewport) => {
      const exception = APPROVED_SCENARIO_COVERAGE_EXCEPTIONS[id as keyof typeof APPROVED_SCENARIO_COVERAGE_EXCEPTIONS];
      return exception?.omitted.includes(`${theme}@${viewport}` as never) ? [] : [`${id}__${theme}__${viewport}`];
    })
  )));
  requireEqualSequence("exact scenario case keys", expectedCaseKeys, expandInstrumentScenarioCases(scenarios).map(({ key }) => key));
  requireEqualSequence(
    "scenario semantic records",
    INSTRUMENT_SCENARIOS.map((current) => JSON.stringify(current)),
    scenarios.map((current) => JSON.stringify(current)),
  );
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
