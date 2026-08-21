import { describe, expect, test } from "vitest";
import {
  CSS_NAMED_COLORS,
  auditAssetManifest,
  auditCss,
  auditPaletteSource,
  auditTokenCss,
  auditTypeScript,
} from "./instrument-color-audit";

const paletteSource = `
export const INSTRUMENT_COLOR_ALLOWLIST = ["#111111"] as const;
const shared = { text: "#111111" } as const;
export const INSTRUMENT_PALETTE = {
  light: { ...shared },
  dark: { ...shared },
} as const;
`;
const expectedPalette = { light: { text: "#111111" }, dark: { text: "#111111" } } as const;
const tokenCss = `
/* instrument-token-definitions:start */
:root, html[data-theme="dark"] { --instrument-text: #111111; }
html[data-theme="light"] { --instrument-text: #111111; }
/* instrument-token-definitions:end */
:root { --fg: var(--instrument-text); color: currentColor; background: transparent; fill: none; }
`;

describe("instrument color audit mutations", () => {
  test.each([
    ["three-digit hex", "#ABC"],
    ["four-digit hex", "#ABCD"],
    ["six-digit hex", "#ABCDEF"],
    ["eight-digit hex", "#ABCDEFFF"],
    ["modern rgb", "rgb(1 2 3 / .5)"],
    ["legacy rgb", "rgb(1, 2, 3)"],
    ["modern rgba", "rgba(1 2 3 / .5)"],
    ["legacy rgba", "rgba(1, 2, 3, .5)"],
    ["modern hsl", "hsl(120deg 40% 50% / .5)"],
    ["legacy hsl", "hsl(120, 40%, 50%)"],
    ["modern hsla", "hsla(120deg 40% 50% / .5)"],
    ["legacy hsla", "hsla(120, 40%, 50%, .5)"],
    ["hwb", "hwb(120 20% 30%)"],
    ["lab", "lab(50% 20 30)"],
    ["lch", "lch(50% 20 30)"],
    ["oklab", "oklab(.5 .1 .1)"],
    ["oklch", "oklch(.5 .1 30)"],
    ["color profile", "color(display-p3 1 0 0)"],
    ["named color", "aliceblue"],
    ["purple", "purple"],
    ["purple alias", "rebeccapurple"],
  ])("rejects a direct %s literal", (_name, literal) => {
    expect(auditCss(`.fixture { color: ${literal}; }`, "fixture.css")).not.toEqual([]);
    expect(auditTypeScript(`const fixture = ${JSON.stringify(literal)};`, "fixture.ts")).not.toEqual([]);
  });

  test("recognizes the complete CSS named-color set", () => {
    expect(CSS_NAMED_COLORS).toHaveLength(148);
    expect(CSS_NAMED_COLORS).toEqual(expect.arrayContaining(["aliceblue", "purple", "rebeccapurple", "yellowgreen"]));
    expect(CSS_NAMED_COLORS.flatMap((color) => auditCss(`.fixture { color: ${color}; }`, "fixture.css").length ? [] : [color])).toEqual([]);
  });

  test("allows only the semantic paint keywords", () => {
    expect(auditCss(".fixture { color: currentColor; background: transparent; fill: none; }", "fixture.css")).toEqual([]);
    expect(auditTypeScript('const values = ["currentColor", "transparent", "none"];', "fixture.ts")).toEqual([]);
  });

  test("rejects unrelated and unknown literals inside the palette", () => {
    expect(auditPaletteSource(paletteSource, ["#111111"], expectedPalette, "palette.ts")).toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\nconst obsolete = "#111111";`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\nconst obsolete = "transparent";`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
    expect(auditPaletteSource(paletteSource.replace("text: \"#111111\"", "text: \"#ABCD\""), ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
  });

  test("validates every declaration inside the exact token block", () => {
    expect(auditTokenCss(tokenCss, ["#111111"], expectedPalette, "tokens.css")).toEqual([]);
    expect(auditTokenCss(tokenCss.replace("--instrument-text: #111111", "--instrument-text: #ABCD"), ["#111111"], expectedPalette, "tokens.css")).not.toEqual([]);
    expect(auditTokenCss(tokenCss.replace("--instrument-text: #111111;", "--instrument-text: #111111; color: purple;"), ["#111111"], expectedPalette, "tokens.css")).not.toEqual([]);
    expect(auditTokenCss(tokenCss.replace("--instrument-text: #111111;", "--rogue: #111111; --instrument-text: #111111;"), ["#111111"], expectedPalette, "tokens.css")).not.toEqual([]);
  });

  test("rejects changed and unmanifested visual asset bytes", () => {
    const manifest = { "public/logo.svg": "646e0b3ee7dd81a3430153d62d00933aee5c1594add82c42b52ba51c826f2e71" };
    expect(auditAssetManifest({ "public/logo.svg": Buffer.from('<svg fill="#fff"/>') }, manifest)).toEqual([]);
    expect(auditAssetManifest({ "public/logo.svg": Buffer.from('<svg fill="#000"/>') }, manifest)).not.toEqual([]);
    expect(auditAssetManifest({ "public/logo.svg": Buffer.from('<svg fill="#fff"/>'), "public/extra.svg": Buffer.from("<svg/>") }, manifest)).not.toEqual([]);
  });
});
