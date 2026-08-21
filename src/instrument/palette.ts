export const INSTRUMENT_COLOR_ALLOWLIST = [
  "#050505", "#060606", "#111111", "#141414", "#181818", "#1C1C1C", "#1D1D1D", "#1E1E1E",
  "#242422", "#242424", "#262626", "#2D2D2D", "#2E2E2E", "#343434", "#3A3A38", "#3F3F3D",
  "#4A4A48", "#5CC45C", "#6A6A66", "#6E6E6A", "#8A8A86", "#9A9A96", "#A4A4A0",
  "#CCCED6", "#D3D6DD", "#D8D8D6", "#DFE2E9", "#E0362C", "#E2E4EA", "#E4E4E2",
  "#E8E8E6", "#EB4438", "#ED6A5E", "#F0B544", "#F1F2F6", "#F2F2F0", "#FFFFFF",
] as const;

const shared = {
  widgetDark: "#141414",
  widgetDarkRaised: "#1E1E1E",
  widgetDarkHover: "#1C1C1C",
  mediaFrame: "#060606",
  textOnDarkPrimary: "#F2F2F0",
  textOnDarkSecondaryReadable: "#A4A4A0",
  textOnDarkMutedDecorative: "#6A6A66",
  alert: "#E0362C",
  alertText: "#050505",
  alertBright: "#EB4438",
  trafficClose: "#ED6A5E",
  trafficMinimize: "#F0B544",
  trafficMaximize: "#5CC45C",
  ghost: "#262626",
  ghostHover: "#2E2E2E",
  divider: "#DFE2E9",
  focus: "#111111",
  terminalBackground: "#060606",
  terminalForeground: "#E8E8E6",
  terminalCursor: "#DFE2E9",
  terminalSelection: "#343434",
  waveformWave: "#4A4A48",
  waveformProgress: "#E8E8E6",
  waveformCursor: "#DFE2E9",
  ditherBase: "#3F3F3D",
  ditherHighlight: "#8A8A86",
  legacyCanvas: "#181818",
  legacySunken: "#111111",
  legacySidebar: "#1D1D1D",
  legacyRaised: "#2D2D2D",
  legacyHover: "#343434",
  legacySelected: "#3A3A38",
} as const;

export const INSTRUMENT_PALETTE = {
  light: {
    desk: "#E2E4EA",
    deskBoard: "#D8D8D6",
    deskHover: "#D3D6DD",
    widgetLight: "#F1F2F6",
    widgetLightHover: "#FFFFFF",
    widgetLightSunken: "#E4E4E2",
    textPrimary: "#141414",
    textSecondaryDecorative: "#6E6E6A",
    textMutedDecorative: "#9A9A96",
    textSecondaryReadable: "#4A4A48",
    unreviewed: "#CCCED6",
    ...shared,
  },
  dark: {
    desk: "#050505",
    deskBoard: "#111111",
    deskHover: "#242422",
    widgetLight: "#141414",
    widgetLightHover: "#242424",
    widgetLightSunken: "#1E1E1E",
    textPrimary: "#F2F2F0",
    textSecondaryDecorative: "#8A8A86",
    textMutedDecorative: "#6A6A66",
    textSecondaryReadable: "#A4A4A0",
    unreviewed: "#3A3A38",
    ...shared,
    focus: "#DFE2E9",
  },
} as const;

function relativeLuminance(color: string): number {
  if (!/^#[\dA-F]{6}$/i.test(color)) throw new TypeError(`Expected a six-digit hex color, received ${color}`);
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

export const DITHER_ASSET_SHA256 = {
  "g1.png": "fb43bf175834760b7cc472c5c8851b883650c47127dc692ead9015c097f80bcb",
  "g2.png": "72dde495cb348ae80a6533fd0871ca09a29a643570ea6c37da491b0ddb3635eb",
  "g3.png": "5dfa56d359c95cfcfb5e1998e379b9fc013e4f473d106ffce636825aaa4e95fd",
  "g4.png": "2c2ccc8a300e3292c6172de49bdc11baa0120ba29d085dd803cd5f04a637e47b",
  "g5.png": "ca0dbba304dc263da977858db43455a871ca7e5ea6d28fd85456dfa0cbed478e",
  "g6.png": "1c0bae79c7c4ae0eb748aaf695d75740f8aef202173f1440800e5bfa4ed775f1",
  "g7.png": "69a66ce0370d80ac3ec671b3ceee0896754f03e72e49ee0148e5137ba4ba29c4",
  "g8.png": "89056912780217afd1eb20ef3b18ed9cbe02b1cd242d92e20842fb846dc5c4a3",
  "orb-22.png": "754610c28180607de31c84bc7ce7a41234049f9295b354803392fa62f116d1c7",
  "ribbon-card-hi.png": "85080b991d4ef998968942ab6b13bae54fa7e1f715a7d10a7c961c909180b574",
  "ribbon-card.png": "3d0850222336365e709e03be1ad7c604f22addb0a40f32cec0e67bfe1870a6af",
  "row-field.png": "4c79cea9da6447e45df8b154decd8b459d37c2264ddb03b50ae8c19aa4220240",
} as const;
