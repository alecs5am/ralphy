import { INSTRUMENT_SCENARIOS } from "./scenarios";
import type { InstrumentRouteKey, InstrumentScenarioState } from "./screen-state-registry";

export interface InstrumentTestFixture {
  id: string;
  routeKey: InstrumentRouteKey;
  state: InstrumentScenarioState;
  payload: unknown;
}

export interface InstrumentTestFixtureProvider {
  get(fixtureId: string): InstrumentTestFixture | null;
}

const fixtures = new Map<string, InstrumentTestFixture>(INSTRUMENT_SCENARIOS.map((scenario) => [scenario.fixtureId, {
  id: scenario.fixtureId,
  routeKey: scenario.routeKey,
  state: scenario.state,
  payload: {
    kind: "instrument-test-fixture",
    workspace: { id: "ux-testing-lab", name: "UX Testing Lab" },
    scenarioId: scenario.id,
    overlay: scenario.overlay,
    overlayOwner: scenario.overlayOwner,
    journey: scenario.overlay === null ? null : scenario.overlay === "shared-select-menu"
      ? ["open", "select", "escape", "focus-return"]
      : ["open", "escape", "focus-return"],
  },
}]));

export const instrumentTestFixtureProvider: InstrumentTestFixtureProvider = {
  get: (fixtureId) => fixtures.get(fixtureId) ?? null,
};
