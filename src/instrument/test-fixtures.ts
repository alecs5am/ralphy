type InstrumentFixtureRouteKey =
  | `startup.${"welcome" | "library" | "migration"}`
  | `workspace.${"overview" | "projects" | "units" | "shared" | "memory" | "calendar"}`
  | `project.${"units" | "documents" | "media" | "activity"}`
  | `settings.${"general" | "profile" | "appearance" | "providers" | "terminal" | "about"}`
  | `marketplace.${"discover" | "results" | "collection" | "detail"}`
  | `marketplace.category.${"models" | "templates" | "recipes" | "prompts" | "components" | "skills"}`
  | `marketplace.library.${"installed" | "saved" | "added" | "downloads" | "updates" | "attention"}`
  | `marketplace.unavailable-detail.${"prompts" | "components" | "skills"}`;

type InstrumentFixtureScenarioState =
  | "restoring" | "loading" | "ready" | "empty" | "offline" | "partial" | "unavailable" | "error"
  | "selected" | "disabled" | "editing" | "conflict" | "history" | "viewer" | "playing" | "scheduling" | "mock-review";

export interface InstrumentTestFixture {
  id: string;
  routeKey: InstrumentFixtureRouteKey;
  state: InstrumentFixtureScenarioState;
  payload: unknown;
}

export interface InstrumentTestFixtureProvider {
  get(fixtureId: string): InstrumentTestFixture | null;
}

const scenarioStates = new Set<InstrumentFixtureScenarioState>([
  "restoring", "loading", "ready", "empty", "offline", "partial", "unavailable", "error",
  "selected", "disabled", "editing", "conflict", "history", "viewer", "playing", "scheduling", "mock-review",
]);
const routeKeyPattern = /^(?:startup|workspace|project|settings|marketplace)(?:\.[a-z0-9-]+)+$/;
const fixturePartPattern = /^[a-z0-9.-]+$/;

function decodeFixturePart(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return encodeURIComponent(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function fixture(fixtureId: string): InstrumentTestFixture | null {
  const [prefix, encodedRouteKey, state, encodedScenarioId, overlayPart, ownerPart, ...extra] = fixtureId.split(":");
  if (prefix !== "instrument-test-fixture" || extra.length || !scenarioStates.has(state as InstrumentFixtureScenarioState)) return null;
  const routeKey = decodeFixturePart(encodedRouteKey);
  const scenarioId = decodeFixturePart(encodedScenarioId);
  if (!routeKey || !scenarioId || !routeKeyPattern.test(routeKey) || !fixturePartPattern.test(scenarioId)) return null;
  const overlay = overlayPart === "-" ? null : overlayPart;
  const overlayOwner = ownerPart === "-" ? null : ownerPart;
  if ((overlay !== null && !fixturePartPattern.test(overlay))
    || (overlayOwner !== null && !fixturePartPattern.test(overlayOwner))
    || (overlay === "shared-select-menu") !== (overlayOwner !== null)) return null;
  return {
    id: fixtureId,
    routeKey: routeKey as InstrumentFixtureRouteKey,
    state: state as InstrumentFixtureScenarioState,
    payload: {
      kind: "instrument-test-fixture",
      workspace: { id: "ux-testing-lab", name: "UX Testing Lab" },
      scenarioId,
      overlay,
      overlayOwner,
      journey: overlay === null ? null : overlay === "shared-select-menu"
        ? ["open", "select", "escape", "focus-return"]
        : ["open", "escape", "focus-return"],
    },
  };
}

export const instrumentTestFixtureProvider: InstrumentTestFixtureProvider = {
  get: fixture,
};
