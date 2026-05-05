// era design tokens — the single source for inline styles.
export const ERA = {
  bg: "#FFFFFF",
  panel: "#FAFAFA",
  ink: "#0A0A0A",
  ink2: "#1A1A1A",
  sub: "#6B6B6B",
  mute: "#9A9A9A",
  rule: "#E5E5E5",
  ruleSoft: "#EEEEEE",
  hover: "#F6F6F6",
  active: "#F0F0F0",
  accent: "#0A0A0A",
  ok: "#1F7A4D",
  warn: "#B5680A",
  busy: "#5366E8",
  err: "#A2231D",
} as const;

export const SANS = {
  fontFamily: "'Helvetica Neue', Helvetica, 'Inter', Arial, sans-serif",
  letterSpacing: "-0.005em",
} as const;

export const MONO = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const DISPLAY = {
  fontFamily: "'Helvetica Neue', Helvetica, 'Inter', Arial, sans-serif",
  fontWeight: 700,
  letterSpacing: "-0.04em",
} as const;

// Stable palette mapped to projects/personas by index.
export const PROJECT_PALETTES: string[][] = [
  ["#F4C7A1", "#E68A6E", "#7C3F2E"],
  ["#FCEDA1", "#F2A93C", "#A65514"],
  ["#CBD8FF", "#7A8FE6", "#2D3A7A"],
  ["#E8D9C2", "#B98A5C", "#5C3A1F"],
  ["#E6E6E6", "#9A9A9A", "#2A2A2A"],
  ["#FFD8E2", "#F289A8", "#7A2A4A"],
  ["#BFE6E0", "#4FA89C", "#0F4A45"],
  ["#EAE3D9", "#A89A88", "#3E372E"],
  ["#1B1B1F", "#3A3A44", "#9499A8"],
  ["#E8F0D6", "#A6C26A", "#3E5520"],
  ["#D6DAFF", "#5366E8", "#1A1F5A"],
  ["#D4E5D4", "#7BAA7B", "#2F4A2F"],
];

export function paletteFor(seed: string | number, idx?: number): string[] {
  if (typeof idx === "number") return PROJECT_PALETTES[idx % PROJECT_PALETTES.length];
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PROJECT_PALETTES[h % PROJECT_PALETTES.length];
}
