import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

async function windowStateModule() {
  const path = "../electron/window-state";
  return import(/* @vite-ignore */ path).catch(() => null);
}

describe("window state", () => {
  test("restores valid bounds inside the current display", async () => {
    const windowState = await windowStateModule();
    expect(windowState).not.toBeNull();
    if (!windowState) return;

    const saved = windowState.parseWindowBounds({
      x: 2_500,
      y: -200,
      width: 1_600,
      height: 1_200,
    });
    expect(saved).not.toBeNull();
    expect(windowState.fitWindowBounds(
      saved!,
      { x: 0, y: 25, width: 1_440, height: 875 },
      { width: 1_100, height: 720 },
    )).toEqual({ x: 0, y: 25, width: 1_440, height: 875 });
    expect(windowState.parseWindowBounds({ width: "1200" })).toBeNull();
  });

  test("uses one solid hidden-inset native title bar without renderer traffic lights", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const shell = readFileSync("src/instrument/InstrumentShell.tsx", "utf8");
    expect(main).toMatch(/titleBarStyle:\s*"hiddenInset"/);
    expect(main).toMatch(/trafficLightPosition:\s*\{\s*x:\s*22,\s*y:\s*16\s*\}/);
    expect(main).not.toMatch(/\bvibrancy\s*:/);
    expect(main).not.toMatch(/\bvisualEffectState\s*:/);
    expect(main).not.toMatch(/backgroundColor:\s*"transparent"/);
    // The window's base fill follows the resolved theme rather than being pinned to dark: it is
    // what shows at the rounded corners and along the edge while the window composites over
    // another, so a fixed dark fill drew a black hairline around a light-themed window.
    expect(main).toMatch(/backgroundColor:\s*nativeTheme\.shouldUseDarkColors\s*\?\s*INSTRUMENT_PALETTE\.dark\.desk/);
    expect(main).toMatch(/INSTRUMENT_PALETTE\.light\.desk/);
    expect(main).toMatch(/nativeTheme\.on\("updated"/);
    expect(main).not.toMatch(/backgroundColor:\s*"#[\dA-F]+"/i);
    expect(shell).not.toMatch(/traffic-light/i);
  });
});
