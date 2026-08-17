import { describe, expect, test } from "vitest";
import {
  projectGlyphSlot,
  projectGlyphVars,
  workspaceDitherVars,
} from "../src/lib/project-glyph";

describe("name-salted visual identity", () => {
  test("is stable and produces varied project and workspace colors", () => {
    const names = [
      "Ralphy Brand",
      "Denti.AI",
      "NIGHTMAKER",
      "Rogue Ralphy",
      "Choose Path Universe",
      "Ralphy Drawings",
      "Launch Studio",
      "Archive",
    ];
    const projectStyles = names.map((name) => projectGlyphVars(name) as Record<string, string>);
    const workspaceStyles = names.map((name) => workspaceDitherVars(name) as Record<string, string>);

    expect(projectGlyphVars(names[0])).toEqual(projectGlyphVars(names[0]));
    expect(new Set(projectStyles.map((style) => style["--glyph-color"])).size).toBeGreaterThan(6);
    expect(new Set(names.map(projectGlyphSlot)).size).toBeGreaterThan(4);
    expect(new Set(workspaceStyles.map((style) => style["--workspace-color"])).size).toBeGreaterThan(6);
  });

  test("assigns a stable static mask slot for the packaged renderer", () => {
    const names = ["Nightmaker Relaunch 001", "Denti Perio", "Ralphy Brand"];
    const slots = names.map(projectGlyphSlot);
    expect(projectGlyphSlot(names[0])).toBe(slots[0]);
    expect(slots.every((slot) => slot >= 1 && slot <= 8)).toBe(true);
    expect(new Set(slots).size).toBeGreaterThan(1);
  });
});
