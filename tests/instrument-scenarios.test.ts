import { describe, expect, test } from "vitest";

import {
  INSTRUMENT_OVERLAYS,
  SHARED_SELECT_OVERLAY_OWNERS,
  type InstrumentOverlayId,
  type InstrumentSharedSelectOwnerId,
} from "../src/instrument/overlay-registry";
import {
  PRODUCTION_GLOBAL_OVERLAY_ROUTES,
  PRODUCTION_SCREEN_STATES,
} from "../src/instrument/production-screen-states";
import {
  INSTRUMENT_SCENARIOS,
  REQUIRED_SCENARIO_THEMES,
  REQUIRED_SCENARIO_VIEWPORTS,
  assertInstrumentScenarioCompleteness,
  expandInstrumentScenarioCases,
  type InstrumentScenario,
  type InstrumentViewport,
} from "../src/instrument/scenarios";
import type { InstrumentRouteKey } from "../src/instrument/screen-state-registry";

const key = (...parts: readonly (string | null)[]) => parts.map((part) => part ?? "-").join("::");
const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort();
const difference = (left: readonly string[], right: readonly string[]) => {
  const accepted = new Set(right);
  return uniqueSorted(left.filter((value) => !accepted.has(value)));
};

function routesForSharedOwner(owner: InstrumentSharedSelectOwnerId): readonly InstrumentRouteKey[] {
  const scope = SHARED_SELECT_OVERLAY_OWNERS[owner].routeScope;
  return scope.kind === "exact"
    ? scope.routeKeys
    : PRODUCTION_SCREEN_STATES.map(({ routeKey }) => routeKey).filter((routeKey) => routeKey.startsWith(scope.prefix));
}

const requiredRouteStates = PRODUCTION_SCREEN_STATES.flatMap(({ routeKey, states }) => (
  states.map((state) => key(routeKey, state))
));
const scenarioRouteStates = INSTRUMENT_SCENARIOS.map(({ routeKey, state }) => key(routeKey, state));

const requiredOverlays = Object.keys(INSTRUMENT_OVERLAYS) as InstrumentOverlayId[];
const scenarioOverlays = INSTRUMENT_SCENARIOS.flatMap(({ overlay }) => overlay === null ? [] : [overlay]);

const requiredSharedPairs = (Object.keys(SHARED_SELECT_OVERLAY_OWNERS) as InstrumentSharedSelectOwnerId[])
  .flatMap((owner) => routesForSharedOwner(owner).map((routeKey) => key(routeKey, "shared-select-menu", owner)));
const scenarioSharedPairs = INSTRUMENT_SCENARIOS
  .filter((scenario) => scenario.overlay === "shared-select-menu")
  .map(({ routeKey, overlay, overlayOwner }) => key(routeKey, overlay, overlayOwner));

const requiredGlobalPairs = Object.entries(PRODUCTION_GLOBAL_OVERLAY_ROUTES)
  .flatMap(([overlay, routeKeys]) => routeKeys.map((routeKey) => key(routeKey, overlay, null)));
const globalOverlayIds = new Set(Object.keys(PRODUCTION_GLOBAL_OVERLAY_ROUTES));
const scenarioGlobalPairs = INSTRUMENT_SCENARIOS
  .filter(({ overlay }) => overlay !== null && globalOverlayIds.has(overlay))
  .map(({ routeKey, overlay, overlayOwner }) => key(routeKey, overlay, overlayOwner));

function independentlyComputedExactCaseKeys(scenarios: readonly InstrumentScenario[]) {
  return scenarios.flatMap((scenario) => scenario.themes.flatMap((theme) => scenario.viewports.flatMap((viewport) => {
    const pair = `${theme}@${viewport}`;
    return scenario.coverageException?.omitted.includes(pair) ? [] : [`${scenario.id}__${theme}__${viewport}`];
  })));
}

describe("instrument scenario contract", () => {
  test("covers production route states, overlays, shared owners, and global overlay routes in both directions", () => {
    expect(() => assertInstrumentScenarioCompleteness()).not.toThrow();
    expect(difference(requiredRouteStates, scenarioRouteStates)).toEqual([]);
    expect(difference(scenarioRouteStates, requiredRouteStates)).toEqual([]);
    expect(difference(requiredOverlays, scenarioOverlays)).toEqual([]);
    expect(difference(scenarioOverlays, requiredOverlays)).toEqual([]);
    expect(difference(requiredSharedPairs, scenarioSharedPairs)).toEqual([]);
    expect(difference(scenarioSharedPairs, requiredSharedPairs)).toEqual([]);
    expect(difference(requiredGlobalPairs, scenarioGlobalPairs)).toEqual([]);
    expect(difference(scenarioGlobalPairs, requiredGlobalPairs)).toEqual([]);
  });

  test("assigns unique stable IDs and only registered states to generated scenarios", () => {
    const ids = INSTRUMENT_SCENARIOS.map(({ id }) => id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    expect(INSTRUMENT_SCENARIOS.find(({ id }) => id === "media.ready")).toMatchObject({
      routeKey: "project.media",
      state: "ready",
      fixtureId: "instrument-test-fixture:media.ready",
    });
  });

  test("locks every ordinary scenario to both themes and all three viewports", () => {
    for (const scenario of INSTRUMENT_SCENARIOS.filter(({ coverageException }) => coverageException === null)) {
      expect(scenario.themes, scenario.id).toEqual(REQUIRED_SCENARIO_THEMES);
      expect(scenario.viewports, scenario.id).toEqual(REQUIRED_SCENARIO_VIEWPORTS);
    }
    for (const scenario of INSTRUMENT_SCENARIOS.filter(({ coverageException }) => coverageException !== null)) {
      expect(scenario.coverageException).toMatchObject({
        reason: expect.stringMatching(/\S/),
        review: { reviewer: expect.stringMatching(/\S/), decision: "approved" },
      });
      expect(scenario.coverageException?.omitted.length).toBeGreaterThan(0);
    }
  });

  test("expands the exact ordered scenario/theme/viewport case set", () => {
    expect(expandInstrumentScenarioCases(INSTRUMENT_SCENARIOS).map(({ key: caseKey }) => caseKey))
      .toEqual(independentlyComputedExactCaseKeys(INSTRUMENT_SCENARIOS));
  });

  test("declares explicit panel setup and reachable rail behavior at every viewport", () => {
    for (const scenario of INSTRUMENT_SCENARIOS) {
      expect(Object.keys(scenario.panelSetup), scenario.id).toEqual(REQUIRED_SCENARIO_VIEWPORTS);
      expect(Object.keys(scenario.expectedRailMode), scenario.id).toEqual(REQUIRED_SCENARIO_VIEWPORTS);
      for (const viewport of REQUIRED_SCENARIO_VIEWPORTS) {
        const setup = scenario.panelSetup[viewport];
        const mode = scenario.expectedRailMode[viewport];
        expect(setup, `${scenario.id}@${viewport}`).toEqual({
          leftVisible: expect.any(Boolean),
          rightPreference: expect.any(Boolean),
          rightOverlayOpen: expect.any(Boolean),
          bottomVisible: expect.any(Boolean),
        });
        if (mode === "docked") {
          expect(viewport, scenario.id).not.toBe("1100x720" satisfies InstrumentViewport);
          expect(scenario.railOwner, scenario.id).not.toBeNull();
          expect(setup.rightPreference, scenario.id).toBe(true);
          expect(setup.rightOverlayOpen, scenario.id).toBe(false);
        } else if (mode === "overlay") {
          expect(scenario.railOwner, scenario.id).not.toBeNull();
          expect(setup.rightOverlayOpen, scenario.id).toBe(true);
        } else {
          expect(setup.rightOverlayOpen, scenario.id).toBe(false);
        }
      }
    }
  });

  test("gives every shared Select owner an open/select/Escape/focus-return keyboard journey", () => {
    const shared = INSTRUMENT_SCENARIOS.filter(({ overlay }) => overlay === "shared-select-menu");
    expect(shared).not.toHaveLength(0);
    for (const scenario of shared) {
      expect(scenario.overlayOwner, scenario.id).not.toBeNull();
      expect(scenario.journeys, scenario.id).toContain("keyboard");
      expect(scenario.focusEntry, scenario.id).toMatch(/shared-select-menu/);
      expect(scenario.focusReturn, scenario.id).toMatch(/shared-select-menu/);
      expect(scenario.scrollOwner, scenario.id).toBe("overlay");
    }
    expect(INSTRUMENT_SCENARIOS
      .filter(({ overlay }) => overlay !== "shared-select-menu")
      .every(({ overlayOwner }) => overlayOwner === null)).toBe(true);
  });
});
