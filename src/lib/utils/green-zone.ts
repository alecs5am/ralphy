// Green Zone — safe-area geometry for 1080×1920 vertical video.
//
// Why: TikTok / Reels / Shorts UI overlays cover ~25-30% of the frame
// (top: username + sound, right: engagement column, bottom: caption + CTA,
// left: small safety). Anything outside this rectangle gets clipped or
// covered on at least one major platform.
//
// Source of truth: docs/green-zone.md.
// Mirror in cli/lib/score.ts (intentional — avoids cross-root imports).
//
// Usage in Remotion compositions:
//   import { GREEN_ZONE, getTextPreset } from "../../lib/utils/green-zone";
//   const hook = getTextPreset("hook");
//   <div style={{ position: "absolute", top: hook.y, left: 0, width: 1080,
//                 textAlign: "center", fontSize: hook.fontSize }}>{text}</div>

export const CANVAS = { width: 1080, height: 1920 } as const;

export const GREEN_ZONE = {
  xMin: 60,
  xMax: 960,
  yMin: 210,
  yMax: 1480,
  width: 900,    // xMax - xMin
  height: 1270,  // yMax - yMin
} as const;

export type Box = { x: number; y: number; width: number; height: number };

export function isInGreenZone(box: Box): boolean {
  return (
    box.x >= GREEN_ZONE.xMin &&
    box.x + box.width <= GREEN_ZONE.xMax &&
    box.y >= GREEN_ZONE.yMin &&
    box.y + box.height <= GREEN_ZONE.yMax
  );
}

// Text role presets — Y position + font-size baseline.
// Centering the text horizontally:
//   left = GREEN_ZONE.xMin + (GREEN_ZONE.width - textWidth) / 2
// or use textAlign:"center" with full-width parent inside the green zone.
export type TextRole = "hook" | "midUpper" | "supporting" | "cta";

export function getTextPreset(role: TextRole): {
  y: number;
  fontSize: number;
  maxWidth: number;
} {
  switch (role) {
    case "hook":
      return { y: 280, fontSize: 72, maxWidth: GREEN_ZONE.width };
    case "midUpper":
      return { y: 380, fontSize: 56, maxWidth: GREEN_ZONE.width };
    case "supporting":
      return { y: 1100, fontSize: 44, maxWidth: GREEN_ZONE.width };
    case "cta":
      return { y: 1380, fontSize: 60, maxWidth: GREEN_ZONE.width };
  }
}

// Center a known-width text horizontally inside the Green Zone.
export function centerX(textWidth: number): number {
  return GREEN_ZONE.xMin + (GREEN_ZONE.width - textWidth) / 2;
}
