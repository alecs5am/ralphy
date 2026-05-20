// Unit tests for scripts/build-cli-surface.ts (01.10.01).

import { describe, test, expect } from "bun:test";
import { parseVerbsFromIndex, renderSurfaceMarkdown } from "../../scripts/build-cli-surface.js";

describe("parseVerbsFromIndex", () => {
  test("extracts verb names from program.addCommand(xxxCmd()) lines", () => {
    const src = `
      program.addCommand(setupCmd());
      program.addCommand(doctorCmd());
      program.addCommand(newCmd());
      program.addCommand(cloneCmd());
    `;
    const verbs = parseVerbsFromIndex(src);
    expect(verbs).toEqual(["setup", "doctor", "new", "clone"]);
  });

  test("ignores commented-out lines", () => {
    const src = `
      // program.addCommand(legacyCmd());
      program.addCommand(setupCmd());
    `;
    expect(parseVerbsFromIndex(src)).toEqual(["setup"]);
  });
});

describe("renderSurfaceMarkdown", () => {
  test("emits a generated-on banner + per-verb sections", () => {
    const md = renderSurfaceMarkdown([
      { name: "doctor", help: "Usage: ralphy doctor\nEnv health check" },
      { name: "setup", help: "Usage: ralphy setup\nFirst-time wizard" },
    ]);
    expect(md).toContain("# Ralphy CLI Surface (generated)");
    expect(md).toContain("DO NOT EDIT");
    expect(md).toContain("### `ralphy doctor`");
    expect(md).toContain("Env health check");
    expect(md).toContain("### `ralphy setup`");
  });
});
