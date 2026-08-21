import { describe, expect, test } from "vitest";
import {
  projectGlyphSlot,
  projectGlyphVars,
  projectGlyphAsset,
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

  test("maps each stable glyph slot to a packaged dither image", () => {
    expect(projectGlyphAsset("UX Testing Lab")).toBe("./assets/dither/g4.png");
    expect(projectGlyphAsset("Nightmaker Relaunch 001")).toBe(`./assets/dither/g${projectGlyphSlot("Nightmaker Relaunch 001")}.png`);
  });

  test("resolves dither assets inside the packaged renderer directory", () => {
    const asset = new URL(projectGlyphAsset("UX Testing Lab"), "file:///Applications/Ralphy%20Media.app/Contents/Resources/app/dist/index.html");
    expect(asset.pathname).toBe("/Applications/Ralphy%20Media.app/Contents/Resources/app/dist/assets/dither/g4.png");
  });
});
