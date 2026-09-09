import { describe, expect, test } from "vitest";

import { SHELL_PANEL_CASES, assertShellGeometry, calibrateGeometry } from "../scripts/audit-instrument-shell.mjs";

describe("instrument shell audit contract", () => {
  test("pins the six viewport and panel permutations", () => {
    expect(SHELL_PANEL_CASES).toHaveLength(6);
    expect(calibrateGeometry({ outer: { width: 1440, height: 900 }, inner: { width: 1440, height: 872 } }).topInset).toBe(28);
    expect(() => assertShellGeometry({ innerWidth: 1100, bodyScrollWidth: 1101, scrollOwners: 1, left: false, right: "overlay", bottom: true, sidebarWidth: 0, railWidth: 0, trafficLightCopies: 0 })).toThrow(/horizontal overflow/i);
  });

  test("launches cases serially and hides audit windows", () => {
    const source = readFileSync("scripts/audit-instrument-shell.mjs", "utf8");
    const main = readFileSync("electron/main.ts", "utf8");
    expect(source).toContain("maxActiveInstances !== 1");
    expect(source).toContain("await child.exited");
    expect(main).toContain("show: !SMOKE_TEST && !INSTRUMENT_SHELL_AUDIT");
  });
});
import { readFileSync } from "node:fs";
