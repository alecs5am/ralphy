import { readFileSync } from "node:fs";

import { afterEach, describe, expect, test, vi } from "vitest";

import { INSTRUMENT_SCENARIOS } from "../src/instrument/scenarios";
import { loadInstrumentTestFixtures } from "../src/instrument/load-test-fixtures";

const loaderSource = readFileSync(new URL("../src/instrument/load-test-fixtures.ts", import.meta.url), "utf8");
const fixtureSource = readFileSync(new URL("../src/instrument/test-fixtures.ts", import.meta.url), "utf8");

afterEach(() => vi.unstubAllEnvs());

describe("instrument production fixture boundary", () => {
  test("uses an exact mock flag and a dynamic fixture import", () => {
    expect(loaderSource).toContain('import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true"');
    expect(loaderSource).toContain('import("./test-fixtures")');
    expect(loaderSource).not.toMatch(/if\s*\(import\.meta\.env\.VITE_RALPHY_ENABLE_MOCKS\s*\)/);
  });

  test("does not load fixtures for false or absent production flags", async () => {
    vi.stubEnv("VITE_RALPHY_ENABLE_MOCKS", "false");
    await expect(loadInstrumentTestFixtures()).resolves.toBeNull();
    vi.stubEnv("VITE_RALPHY_ENABLE_MOCKS", undefined);
    await expect(loadInstrumentTestFixtures()).resolves.toBeNull();
  });

  test("loads stable UX Testing Lab renderer DTOs only for the exact true flag", async () => {
    vi.stubEnv("VITE_RALPHY_ENABLE_MOCKS", "true");
    const provider = await loadInstrumentTestFixtures();
    const scenario = INSTRUMENT_SCENARIOS.find(({ id }) => id === "media.ready")!;

    expect(provider?.get(scenario.fixtureId)).toEqual({
      id: "instrument-test-fixture:media.ready",
      routeKey: "project.media",
      state: "ready",
      payload: {
        kind: "instrument-test-fixture",
        workspace: { id: "ux-testing-lab", name: "UX Testing Lab" },
        scenarioId: "media.ready",
        overlay: null,
        overlayOwner: null,
        journey: null,
      },
    });
    expect(provider?.get("instrument-test-fixture:missing")).toBeNull();
  });

  test("keeps the fixture module renderer-only and supplies every registered scenario", async () => {
    expect(fixtureSource).not.toMatch(/(?:from|import\s*\()["'](?:electron|node:|\.\.\/lib\/ipc|\.\.\/\.\.\/electron)/);
    vi.stubEnv("VITE_RALPHY_ENABLE_MOCKS", "true");
    const provider = await loadInstrumentTestFixtures();
    expect(provider).not.toBeNull();
    for (const scenario of INSTRUMENT_SCENARIOS) {
      expect(provider?.get(scenario.fixtureId), scenario.id).toMatchObject({
        id: scenario.fixtureId,
        routeKey: scenario.routeKey,
        state: scenario.state,
      });
    }
  });
});
