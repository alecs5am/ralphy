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

  test("uses one solid frameless title bar and draws no window controls at all", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const shell = readFileSync("src/app/layout/InstrumentShell.tsx", "utf8");
    expect(main).toMatch(/titleBarStyle:\s*"hidden"/);
    // The lights are not repositioned, they are gone: a hidden title bar still draws them on
    // macOS, so the one call that removes them has to be on the window and nothing may place them.
    expect(main).not.toMatch(/trafficLightPosition/);
    expect(main).toMatch(/process\.platform === "darwin"[^\n]*setWindowButtonVisibility\(false\)/);
    expect(main).not.toMatch(/\bvibrancy\s*:/);
    expect(main).not.toMatch(/\bvisualEffectState\s*:/);
    expect(main).not.toMatch(/backgroundColor:\s*"transparent"/);
    // The window's base fill is what shows at the rounded corners and along the edge while the
    // window composites over another, so it has to be whatever the renderer paints there. That is
    // the chrome, in both themes, which is why the fill no longer reads the resolved theme and no
    // longer has to be restated when the OS changes it.
    expect(main).toMatch(/const WINDOW_FILL = INSTRUMENT_PALETTE\.dark\.chrome;/);
    expect(main).toMatch(/backgroundColor:\s*WINDOW_FILL,/);
    expect(main).not.toMatch(/nativeTheme\.on\("updated"/);
    // Leaving full screen hands the title bar back, and macOS redraws the lights with it.
    expect(main).toMatch(/on\("leave-full-screen", hideWindowButtons\)/);
    expect(main).not.toMatch(/backgroundColor:\s*"#[\dA-F]+"/i);
    expect(shell).not.toMatch(/traffic-light/i);
    // ...and no run of shell reserved for them either, in any row.
    expect(shell).not.toMatch(/w-traffic-/);
    expect(readFileSync("src/app/layout/ShellTopRow.tsx", "utf8")).not.toMatch(/w-traffic-/);
    expect(readFileSync("src/widgets/sidebar/ui/ContextSidebar.tsx", "utf8")).not.toMatch(/w-traffic-/);
  });
});
