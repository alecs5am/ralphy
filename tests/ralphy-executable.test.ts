import { describe, expect, test } from "vitest";

import { resolveRalphyExecutable } from "../electron/ralphy/executable";

describe("resolveRalphyExecutable", () => {
  test("uses only the bundled runtime in packaged builds", () => {
    expect(resolveRalphyExecutable({
      isPackaged: true,
      resourcesPath: "/Applications/Ralphy Media.app/Contents/Resources",
      env: { RALPHY_BIN: "/tmp/dev-ralphy" },
    })).toBe("/Applications/Ralphy Media.app/Contents/Resources/bin/ralphy");
  });

  test("uses the explicit development override", () => {
    expect(resolveRalphyExecutable({
      isPackaged: false,
      resourcesPath: "/unused",
      env: { RALPHY_BIN: "/tmp/dev-ralphy" },
    })).toBe("/tmp/dev-ralphy");
  });

  test("leaves development PATH discovery to the bridge client", () => {
    expect(resolveRalphyExecutable({
      isPackaged: false,
      resourcesPath: "/unused",
      env: {},
    })).toBeUndefined();
  });
});
