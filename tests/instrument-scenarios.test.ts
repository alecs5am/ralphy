import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  INSTRUMENT_OVERLAYS,
  SHARED_SELECT_OVERLAY_OWNERS,
  type InstrumentOverlayId,
  type InstrumentSharedSelectOwnerId,
} from "../src/instrument/overlay-registry";
import {
  PRODUCTION_LOCAL_OVERLAY_TARGETS,
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

const LOCKED_THEMES = ["light", "dark"] as const;
const LOCKED_VIEWPORTS = ["1440x900", "1280x800", "1100x720"] as const;
const REVIEWED_EXCEPTIONS = {
  "overlay.right-rail-sheet.startup.library": {
    omitted: ["light@1440x900", "light@1280x800", "dark@1440x900", "dark@1280x800"],
    reason: "The right-rail sheet exists only below the docking threshold; wide layouts use the docked rail.",
    review: { reviewer: "Nothing OS plan review", decision: "approved" },
  },
} as const;

const canonicalRouteScenarioId = (routeKey: InstrumentRouteKey, state: string) => (
  `${routeKey.startsWith("project.") ? routeKey.slice("project.".length) : routeKey}.${state}`
);

const canonicalScenarioIds = [
  ...PRODUCTION_SCREEN_STATES.flatMap(({ routeKey, states }) => states.map((state) => canonicalRouteScenarioId(routeKey, state))),
  ...Object.entries(PRODUCTION_LOCAL_OVERLAY_TARGETS).map(([overlay, target]) => `overlay.${overlay}.${target.routeKey}`),
  ...(Object.keys(SHARED_SELECT_OVERLAY_OWNERS) as InstrumentSharedSelectOwnerId[])
    .flatMap((owner) => routesForSharedOwner(owner).map((routeKey) => `overlay.shared-select-menu.${owner}.${routeKey}`)),
  ...Object.entries(PRODUCTION_GLOBAL_OVERLAY_ROUTES)
    .flatMap(([overlay, routeKeys]) => routeKeys.map((routeKey) => `overlay.${overlay}.${routeKey}`)),
];

const canonicalCaseKeys = canonicalScenarioIds.flatMap((scenarioId) => LOCKED_THEMES.flatMap((theme) => LOCKED_VIEWPORTS.flatMap((viewport) => {
  const reviewed = REVIEWED_EXCEPTIONS[scenarioId as keyof typeof REVIEWED_EXCEPTIONS];
  return reviewed?.omitted.includes(`${theme}@${viewport}` as never) ? [] : [`${scenarioId}__${theme}__${viewport}`];
})));

function semanticRecords(scenarios: readonly InstrumentScenario[]) {
  return scenarios.map((scenario) => [
    scenario.id,
    scenario.routeKey,
    scenario.state,
    scenario.fixtureId,
    scenario.rootMarker,
    [...scenario.landmarks],
    scenario.railOwner,
    scenario.overlay,
    scenario.overlayOwner,
    scenario.focusEntry,
    scenario.focusReturn,
    scenario.scrollOwner,
    [...scenario.themes],
    [...scenario.viewports],
    LOCKED_VIEWPORTS.map((viewport) => [
      viewport,
      scenario.expectedRailMode[viewport],
      scenario.panelSetup[viewport].leftVisible,
      scenario.panelSetup[viewport].rightPreference,
      scenario.panelSetup[viewport].rightOverlayOpen,
      scenario.panelSetup[viewport].bottomVisible,
    ]),
    scenario.coverageException,
    [...scenario.journeys],
  ]);
}

const semanticDigest = (scenarios: readonly InstrumentScenario[]) => createHash("sha256")
  .update(JSON.stringify(semanticRecords(scenarios)))
  .digest("hex");

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
      fixtureId: "instrument-test-fixture:project.media:ready:media.ready:-:-",
    });
    expect(ids).toEqual(canonicalScenarioIds);
    expect(ids).toHaveLength(339);
  });

  test("locks literal themes, viewports, and the immutable reviewed exception allowlist", () => {
    expect(REQUIRED_SCENARIO_THEMES).toEqual(LOCKED_THEMES);
    expect(REQUIRED_SCENARIO_VIEWPORTS).toEqual(LOCKED_VIEWPORTS);
    for (const scenario of INSTRUMENT_SCENARIOS) {
      expect(scenario.themes, scenario.id).toEqual(LOCKED_THEMES);
      expect(scenario.viewports, scenario.id).toEqual(LOCKED_VIEWPORTS);
    }
    expect(Object.fromEntries(INSTRUMENT_SCENARIOS
      .filter(({ coverageException }) => coverageException !== null)
      .map(({ id, coverageException }) => [id, coverageException]))).toEqual(REVIEWED_EXCEPTIONS);
  });

  test("expands the exact production-derived scenario/theme/viewport case set", () => {
    expect(expandInstrumentScenarioCases(INSTRUMENT_SCENARIOS).map(({ key: caseKey }) => caseKey))
      .toEqual(canonicalCaseKeys);
    expect(canonicalCaseKeys).toHaveLength(2_030);
  });

  test("binds every stable scenario ID to one frozen semantic record", () => {
    expect(semanticDigest(INSTRUMENT_SCENARIOS)).toBe("e1bcf086c1a2fa6ffeec9bbc949623f117a2d6e9aa52128d59d4fc582f0e117a");
  });

  test("rejects set-preserving route, state, overlay, and owner swaps across stable IDs", () => {
    const swap = <Key extends keyof InstrumentScenario>(firstId: string, secondId: string, field: Key) => {
      const first = INSTRUMENT_SCENARIOS.find((scenario) => scenario.id === firstId)!;
      const second = INSTRUMENT_SCENARIOS.find((scenario) => scenario.id === secondId)!;
      return INSTRUMENT_SCENARIOS.map((scenario) => scenario.id === firstId
        ? { ...scenario, [field]: second[field] }
        : scenario.id === secondId ? { ...scenario, [field]: first[field] } : scenario);
    };
    const mutations = [
      swap("startup.library.ready", "workspace.projects.ready", "routeKey"),
      swap("media.ready", "media.selected", "state"),
      swap("overlay.media-viewer.project.media", "overlay.media-context-menu.project.media", "overlay"),
      swap("overlay.shared-select-menu.shared.toolbar.workspace.shared", "overlay.shared-select-menu.shared.workflow.workspace.shared", "overlayOwner"),
      swap("overlay.agent-chat-recent-menu.startup.library", "overlay.agent-chat-provider-menu.startup.library", "overlay"),
    ];

    for (const mutated of mutations) {
      expect(() => assertInstrumentScenarioCompleteness(mutated)).toThrow(/semantic/i);
      expect(semanticDigest(mutated)).not.toBe("b0f06dc4225d6197ec3af91450a3114c54e06810e3cd7b9c78e4ee1beb109e44");
    }
  });

  test("rejects widening the approved exception or adding an unreviewed exception", () => {
    const widened = INSTRUMENT_SCENARIOS.map((scenario) => scenario.id === "overlay.right-rail-sheet.startup.library" ? {
      ...scenario,
      coverageException: {
        ...scenario.coverageException!,
        omitted: LOCKED_THEMES.flatMap((theme) => LOCKED_VIEWPORTS.map((viewport) => `${theme}@${viewport}` as const)),
      },
    } : scenario);
    const added = INSTRUMENT_SCENARIOS.map((scenario) => scenario.id === "media.ready" ? {
      ...scenario,
      coverageException: {
        omitted: ["light@1440x900" as const],
        reason: "Unreviewed shrink",
        review: { reviewer: "mutation", decision: "approved" as const },
      },
    } : scenario);

    expect(() => assertInstrumentScenarioCompleteness(widened)).toThrow(/coverage exception/i);
    expect(() => assertInstrumentScenarioCompleteness(added)).toThrow(/coverage exception/i);
    expect(expandInstrumentScenarioCases(widened).map(({ key: caseKey }) => caseKey)).not.toEqual(canonicalCaseKeys);
    expect(expandInstrumentScenarioCases(added).map(({ key: caseKey }) => caseKey)).not.toEqual(canonicalCaseKeys);
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
          expect(viewport, scenario.id).not.toBe("1100x720");
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
