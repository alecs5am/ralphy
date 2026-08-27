import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "esbuild";
import { afterEach, describe, expect, test, vi } from "vitest";

import { INSTRUMENT_SCENARIOS } from "@/shared/instrument/scenarios";
import { loadInstrumentTestFixtures } from "@/shared/instrument/load-test-fixtures";

const loaderSource = readFileSync(new URL("../src/shared/instrument/load-test-fixtures.ts", import.meta.url), "utf8");
const fixtureSource = readFileSync(new URL("../src/shared/instrument/test-fixtures.ts", import.meta.url), "utf8");

async function bundleFixtureLoader(flag: "true" | "false" | undefined) {
  return build({
    absWorkingDir: process.cwd(),
    alias: { "@": resolve("src") },
    entryPoints: [resolve("src/shared/instrument/load-test-fixtures.ts")],
    bundle: true,
    define: {
      "import.meta.env.VITE_RALPHY_ENABLE_MOCKS": flag === undefined ? "undefined" : JSON.stringify(flag),
    },
    format: "esm",
    logLevel: "silent",
    metafile: true,
    minify: true,
    outdir: "instrument-fixture-bundle",
    platform: "browser",
    splitting: true,
    target: "chrome130",
    treeShaking: true,
    write: false,
  });
}

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
      id: "instrument-test-fixture:project.media:ready:media.ready:-:-",
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

  test("fails closed for well-formed but unregistered routes, scenarios, owners, and tuple mismatches", async () => {
    vi.stubEnv("VITE_RALPHY_ENABLE_MOCKS", "true");
    const provider = await loadInstrumentTestFixtures();
    const unknown = [
      "instrument-test-fixture:project.fake:ready:not.registered:-:-",
      "instrument-test-fixture:project.media:ready:media.not-registered:-:-",
      "instrument-test-fixture:workspace.shared:ready:overlay.shared-select-menu.unknown.owner.workspace.shared:shared-select-menu:unknown.owner",
      "instrument-test-fixture:project.activity:ready:media.ready:-:-",
      "instrument-test-fixture:project.media:error:media.ready:-:-",
    ];
    for (const fixtureId of unknown) expect(provider?.get(fixtureId), fixtureId).toBeNull();
  });

  test("keeps the fixture module renderer-only and supplies every registered scenario", async () => {
    expect(fixtureSource).not.toMatch(/^\s*import(?!\s+type\b)/m);
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

  test("emits one small leaf fixture chunk with no App, screen, IPC, Electron, or filesystem edge", async () => {
    const result = await bundleFixtureLoader("true");
    const inputs = Object.keys(result.metafile.inputs).sort();
    const bundled = result.outputFiles.map(({ text }) => text).join("\n");
    const bytes = result.outputFiles.reduce((total, { contents }) => total + contents.byteLength, 0);

    expect(inputs).toEqual([
      "src/shared/instrument/load-test-fixtures.ts",
      "src/shared/instrument/test-fixtures.ts",
    ]);
    expect(bytes).toBeLessThan(12_000);
    expect(bundled).toContain("instrument-test-fixture");
    expect(bundled).toContain("UX Testing Lab");
    expect(bundled).not.toMatch(/window\.ralphy|createMockBridge|IPC bridge|ProjectScreen|SettingsScreen|\/screens\/|electron|node:(?:fs|path)/i);
  });

  test.each(["false", undefined] as const)("tree-shakes fixture IDs and paths when the flag is %s", async (flag) => {
    const result = await bundleFixtureLoader(flag);
    const bundled = result.outputFiles.map(({ text }) => text).join("\n");
    expect(bundled).not.toMatch(/instrument-test-fixture|UX Testing Lab|test-fixtures/);
    expect(result.outputFiles).toHaveLength(1);
  });
});
