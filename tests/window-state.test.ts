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
});
