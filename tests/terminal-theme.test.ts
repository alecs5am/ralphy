import { describe, expect, test } from "vitest";

import { INSTRUMENT_PALETTE } from "../src/instrument/palette";
import { terminalTheme } from "../src/terminal/controller";

describe("terminal theme", () => {
  test("uses the resolved named palette", () => {
    expect(terminalTheme("light").background).toBe(INSTRUMENT_PALETTE.light.terminalBackground);
    expect(terminalTheme("dark").background).toBe(INSTRUMENT_PALETTE.dark.terminalBackground);
  });
});
