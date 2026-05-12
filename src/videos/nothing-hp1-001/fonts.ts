import { staticFile } from "remotion";

/**
 * Nothing font kit — what ships in /public/fonts/nothing/.
 *
 * Weight map below mirrors the actual OTF/TTF files on disk:
 *
 * - Ndot55 / Ndot57:   SINGLE weight only (Regular = 400). Brand-defined pixel
 *                      typeface — no bold variant exists. Use the *Caps suffix
 *                      for an all-caps width tweak; use Ndot57 for a slightly
 *                      different pixel grid.
 * - NType82:           400 (Regular) + 700 (Headline). Headline is the heaviest
 *                      that ships; bolder would be faux-synthesized.
 * - NType82Mono:       400 only.
 * - LetteraMonoLL:     300 / 400 / 500 + matching italics. Use weight + style
 *                      combos like `{ fontWeight: 500, fontStyle: 'italic' }`.
 */

let injected = false;
export const ensureNothingFonts = () => {
  if (injected || typeof document === "undefined") return;
  const url = (filename: string) => staticFile(`fonts/nothing/${filename}`);
  const style = document.createElement("style");
  style.textContent = `
    /* — Ndot55 (pixel logo, single weight) */
    @font-face { font-family: "Ndot55"; src: url("${url("Ndot55-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "Ndot55Caps"; src: url("${url("Ndot55Caps-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }

    /* — Ndot57 (alternate pixel size, single weight) */
    @font-face { font-family: "Ndot57"; src: url("${url("Ndot57-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "Ndot57Caps"; src: url("${url("Ndot57Caps-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "Ndot77"; src: url("${url("Ndot77JPExtended.ttf")}") format("truetype"); font-weight: 400; font-style: normal; font-display: block; }

    /* — NType82 (corporate sans: Regular + Headline) */
    @font-face { font-family: "NType82"; src: url("${url("NType82-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "NType82"; src: url("${url("NType82-Headline.otf")}") format("opentype"); font-weight: 700; font-style: normal; font-display: block; }
    @font-face { font-family: "NType82Mono"; src: url("${url("NType82Mono-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }

    /* — LetteraMonoLL (full multi-weight + italic) */
    @font-face { font-family: "LetteraMonoLL"; src: url("${url("LetteraMonoLL-Light.otf")}") format("opentype"); font-weight: 300; font-style: normal; font-display: block; }
    @font-face { font-family: "LetteraMonoLL"; src: url("${url("LetteraMonoLL-LightItalic.otf")}") format("opentype"); font-weight: 300; font-style: italic; font-display: block; }
    @font-face { font-family: "LetteraMonoLL"; src: url("${url("LetteraMonoLL-Regular.otf")}") format("opentype"); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "LetteraMonoLL"; src: url("${url("LetteraMonoLL-Italic.otf")}") format("opentype"); font-weight: 400; font-style: italic; font-display: block; }
    @font-face { font-family: "LetteraMonoLL"; src: url("${url("LetteraMonoLL-Medium.otf")}") format("opentype"); font-weight: 500; font-style: normal; font-display: block; }
    @font-face { font-family: "LetteraMonoLL"; src: url("${url("LetteraMonoLL-MediumItalic.otf")}") format("opentype"); font-weight: 500; font-style: italic; font-display: block; }
  `;
  document.head.appendChild(style);
  injected = true;
};

// Convenience family strings ------------------------------------------------

export const FONT_NDOT = "Ndot55, Ndot57, monospace";
export const FONT_NDOT_CAPS = "Ndot55Caps, Ndot55, monospace";
export const FONT_NDOT_57 = "Ndot57, Ndot55, monospace";
export const FONT_NDOT_JP = "Ndot77, Ndot55, monospace";
export const FONT_NTYPE = "NType82, sans-serif";
export const FONT_NTYPE_MONO = "NType82Mono, monospace";
export const FONT_LETTERA = "LetteraMonoLL, monospace";
