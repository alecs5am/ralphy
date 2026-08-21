import { describe, expect, test } from "vitest";
import {
  CSS_NAMED_COLORS,
  CSS_SYSTEM_COLORS,
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

const SYSTEM_COLOR_MUTATIONS = [
  "accentcolor", "accentcolortext", "activetext", "buttonborder", "buttonface", "buttontext",
  "canvas", "canvastext", "field", "fieldtext", "graytext", "highlight", "highlighttext",
  "linktext", "mark", "marktext", "selecteditem", "selecteditemtext", "visitedtext",
  "activeborder", "activecaption", "appworkspace", "background", "buttonhighlight", "buttonshadow",
  "captiontext", "inactiveborder", "inactivecaption", "inactivecaptiontext", "infobackground", "infotext",
  "menu", "menutext", "scrollbar", "threeddarkshadow", "threedface", "threedhighlight",
  "threedlightshadow", "threedshadow", "window", "windowframe", "windowtext",
] as const;

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

  test.each([
    ["escaped named color", String.raw`\70 urple`],
    ["escaped function name", String.raw`r\67 b(127 123 214)`],
    ["escaped system color", String.raw`\43 anvasText`],
  ])("rejects a direct %s", (_name, literal) => {
    expect(auditCss(`.fixture { color: ${literal}; }`, "fixture.css")).not.toEqual([]);
    expect(auditTypeScript(`const fixture = ${JSON.stringify(literal)};`, "fixture.ts")).not.toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\nconst obsolete = ${JSON.stringify(literal)};`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
  });

  test("rejects every standard and deprecated CSS system color, case-insensitively", () => {
    expect(SYSTEM_COLOR_MUTATIONS).toHaveLength(42);
    expect(CSS_SYSTEM_COLORS).toEqual(SYSTEM_COLOR_MUTATIONS);
    for (const color of SYSTEM_COLOR_MUTATIONS) {
      const mixedCase = color.replace(/^./, (letter) => letter.toUpperCase());
      expect(auditCss(`.fixture { color: ${mixedCase}; }`, "fixture.css"), color).not.toEqual([]);
      expect(auditTypeScript(`const fixture = ${JSON.stringify(mixedCase)};`, "fixture.ts"), color).not.toEqual([]);
      expect(auditTypeScript(`const fixture = \`${mixedCase}\`;`, "fixture.ts"), color).not.toEqual([]);
    }
  });

  test("does not mistake structural TypeScript strings for paint values", () => {
    const overlaySource = `
      type InstrumentOverlayKind = "menu";
      const INSTRUMENT_OVERLAYS = { overlay: { kind: "menu" } };
      const overlayRoles: Record<InstrumentOverlayKind, "menu"> = { menu: "menu" };
    `;
    const consumerSource = `
      const view = <button role="menu" aria-haspopup="menu" />;
      const prose = ["Observation window", "Use the canvas for the preview", "Recalled as background context", "CanvasText auto generated"];
      const ids = ["canvas-panel", "background-job", "window.ralphy"];
      const injectedJavaScript = ["if (window.ralphy) return true", "if(window.ralphy) return true", "render(CanvasText)"];
      const transitionCss = ".fixture { transition: background 100ms linear; }";
    `;
    expect(auditTypeScript(overlaySource, "src/instrument/overlay-registry.tsx")).toEqual([]);
    expect(auditTypeScript('const SAFE_HTML_TAGS = new Set(["mark"]);', "src/components/MarkdownView.tsx")).toEqual([]);
    expect(auditTypeScript(consumerSource, "fixture.tsx")).toEqual([]);
    expect(auditTypeScript('const fixture = { color: "CanvasText" };', "fixture.ts")).not.toEqual([]);
  });

  test("audits CSS-in-JS values from their paint property context", () => {
    expect(auditTypeScript(`
      const style = {
        background: "CanvasText border-box",
        boxShadow: "CanvasText 0 0",
        outline: "CanvasText auto",
        border: "medium none CanvasText",
        WebkitTextStroke: "medium CanvasText",
      };
    `, "fixture.ts")).toEqual([
      "fixture.ts:3:CanvasText",
      "fixture.ts:4:CanvasText",
      "fixture.ts:5:CanvasText",
      "fixture.ts:6:CanvasText",
      "fixture.ts:7:CanvasText",
    ]);
    expect(auditTypeScript(`
      const style = { background: \`CanvasText border-box\` };
      style.boxShadow = \`CanvasText 0 0\`;
    `, "fixture.ts")).toEqual([
      "fixture.ts:2:CanvasText",
      "fixture.ts:3:CanvasText",
    ]);
    expect(auditTypeScript('const style = { background: String("CanvasText round") };', "fixture.ts")).toEqual([
      "fixture.ts:1:CanvasText",
    ]);
    expect(auditPaletteSource(`${paletteSource}
      const style = { outline: "CanvasText auto" };
      style.border = \`medium none CanvasText\`;
    `, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
  });

  test("does not mistake TypeScript identity and routing strings for paint values", () => {
    expect(auditTypeScript(`
      const id = "canvas";
      const ids = ["canvas"];
      const data = "canvas";
      const aria = "window";
      const route = { id: "window", route: "background", domain: "canvas" };
      const domains = ["window"];
      const view = <div id="canvas" data-view="window" aria-label="background" data-copy={String("canvas")} />;
    `, "fixture.tsx")).toEqual([]);
  });

  test("still audits embedded CSS inside a non-paint TypeScript field", () => {
    expect(auditTypeScript('const route = ".fixture { color: CanvasText; }";', "fixture.ts")).not.toEqual([]);
    expect(auditTypeScript('const view = <div color="CanvasText" style="background: CanvasText" />;', "fixture.tsx")).toEqual([
      "fixture.tsx:1:CanvasText",
      "fixture.tsx:1:CanvasText",
    ]);
  });

  test("does not mistake CSS property identifiers for system-color values", () => {
    expect(auditCss(`
      .fixture {
        transition: background 100ms linear;
        transition-property: background;
        will-change: background;
        content: "Canvas";
        content: counter(mark);
        background-image: url(CanvasText.svg);
        grid-area: canvas;
        view-transition-name: canvas;
        container-name: window;
        counter-reset: mark;
        animation-name: background;
      }
    `, "fixture.css")).toEqual([]);
    expect(auditTypeScript('const style = { content: ["Canvas", "counter(mark)"] };', "fixture.ts")).toEqual([]);
  });

  test("does not mistake non-paint at-rule conditions for system colors", () => {
    expect(auditCss(`
      @supports (transition: background 100ms) { .fixture { display: block; } }
      @supports (grid-area: canvas) { .fixture { display: grid; } }
      @supports (animation-name: background) { .fixture { display: block; } }
      @property --area { syntax: "<custom-ident>"; inherits: false; initial-value: canvas; }
    `, "fixture.css")).toEqual([]);
  });

  test.each([
    ["embedded declaration", ".fixture { color: CanvasText; }"],
    ["embedded escaped declaration", String.raw`.fixture { color: \43 anvasText; }`],
    ["standalone border value", "1px solid CanvasText"],
    ["standalone escaped shadow value", String.raw`0 0 2px \43 anvasText`],
    ["nested function value", "linear-gradient(CanvasText, transparent)"],
    ["embedded mask value", ".fixture { mask-image: linear-gradient(CanvasText, transparent); }"],
    ["embedded property descriptor", '@property --paint { syntax: "<color>"; inherits: false; initial-value: CanvasText; }'],
  ])("rejects a %s in every TypeScript string context", (_name, value) => {
    const source = `const fixture = { nested: [${JSON.stringify(value)}] };`;
    expect(auditTypeScript(source, "fixture.ts")).not.toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\n${source}`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
  });

  test("rejects an escaped system color after an expression in a CSS template", () => {
    const source = "const css = `.fixture { border: ${width} solid \\\\43 anvasText; }`;";
    expect(auditTypeScript(source, "fixture.ts")).not.toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\n${source}`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
  });

  test.each([
    ["tag-suffixed map", 'const COLOR_TAGS = { color: "CanvasText" };'],
    ["same-name map", 'const colors = { canvas: "Canvas" };'],
    ["kind discriminator", 'const paint = { kind: "CanvasText" };'],
    ["nested tag-suffixed map", 'const COLOR_TAGS = { nested: { kind: "CanvasText" } };'],
    ["overlay registry name spoof", 'type InstrumentOverlayKind = "menu"; const INSTRUMENT_OVERLAYS = { overlay: { kind: "menu" } };'],
    ["HTML tag set name spoof", 'const SAFE_HTML_TAGS = new Set(["mark"]);'],
  ])("rejects a system color hidden by a broad structural %s", (_name, source) => {
    expect(auditTypeScript(source, "fixture.ts")).not.toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\n${source}`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
  });

  test.each([
    ".fixture { mask-image: linear-gradient(CanvasText, transparent); }",
    ".fixture { mask: linear-gradient(90deg, CanvasText, transparent); }",
    ".fixture { --nested-paint: linear-gradient(CanvasText, transparent); }",
    '@property --paint { syntax: "<color>"; inherits: false; initial-value: CanvasText; }',
    "@supports (color: CanvasText) { .fixture { display: block; } }",
  ])("rejects system colors from every CSS declaration or descriptor value: %s", (source) => {
    expect(auditCss(source, "fixture.css")).not.toEqual([]);
    expect(auditTokenCss(`${tokenCss}\n${source}`, ["#111111"], expectedPalette, "tokens.css")).not.toEqual([]);
  });

  test("rejects system colors inside palette and token sources", () => {
    expect(auditPaletteSource(`${paletteSource}\nconst obsolete = "CanvasText";`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
    expect(auditPaletteSource(`${paletteSource}\nconst obsolete = "WindowText";`, ["#111111"], expectedPalette, "palette.ts")).not.toEqual([]);
    expect(auditTokenCss(tokenCss.replace("--instrument-text: #111111", "--instrument-text: CanvasText"), ["#111111"], expectedPalette, "tokens.css")).not.toEqual([]);
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
