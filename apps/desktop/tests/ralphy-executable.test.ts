import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { resolveRalphyExecutable } from "../electron/ralphy/executable";

describe("resolveRalphyExecutable", () => {
  test("uses only the bundled runtime in packaged builds", () => {
    expect(resolveRalphyExecutable({
      isPackaged: true,
      appPath: "/Applications/Ralphy Media.app/Contents/Resources/app",
      resourcesPath: "/Applications/Ralphy Media.app/Contents/Resources",
      env: { RALPHY_BIN: "/tmp/dev-ralphy" },
    })).toBe("/Applications/Ralphy Media.app/Contents/Resources/bin/ralphy");
  });

  test("uses the explicit development override", () => {
    expect(resolveRalphyExecutable({
      isPackaged: false,
      appPath: "/repo/apps/desktop",
      resourcesPath: "/unused",
      env: { RALPHY_BIN: "/tmp/dev-ralphy" },
    })).toBe("/tmp/dev-ralphy");
  });

  test("runs the repository bridge from another working directory without a CLI override", () => {
    const bin = resolveRalphyExecutable({
      isPackaged: false,
      appPath: fileURLToPath(new URL("..", import.meta.url)),
      resourcesPath: "/unused",
      env: {},
    });
    expect(bin).toBeTruthy();
    const help = execFileSync(bin!, ["bridge", "--help"], {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(help).toContain("Usage: ralphy bridge");
    expect(help).toContain("--stdio");
    expect(help).toContain("--root");
  });
});
