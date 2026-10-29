// Platform UI safe zones for 9:16 (1080x1920) vertical video (#564).
//
// The geometry is DATA: one list of UI zones per platform (where TikTok,
// Instagram Reels and YouTube Shorts draw their own chrome over the video).
// `docs/green-zone.md` documents the same numbers as the per-platform safe box;
// the safe box is the frame minus these zones. `ralphy editor lint-safe-zones`
// probes a composition in headless Chromium (safe-zones-probe.ts) and hands the
// measured element boxes to `checkSafeZones`, which is pure and unit-tested.
//
// Zone kinds:
//   ui    platform chrome covers it (tabs, engagement rail, caption + CTA block).
//         Text, captions, CTAs, faces and products there are errors.
//   edge  crop / bezel margin. Content there is a warning (it survives on most
//         devices but reads as cramped and is cut on some).

export const SAFE_ZONE_FRAME = { width: 1080, height: 1920 } as const;

export const SAFE_ZONE_PLATFORMS = ["tiktok", "reels", "shorts"] as const;
export type SafeZonePlatform = (typeof SAFE_ZONE_PLATFORMS)[number];

/** Roles the lint checks. `text` is any visible text the probe finds; the rest come from `data-safe-zone`. */
export const SAFE_ZONE_ROLES = ["text", "caption", "cta", "face", "product"] as const;
export type SafeZoneRole = (typeof SAFE_ZONE_ROLES)[number];

export type Rect = { left: number; top: number; width: number; height: number };

export type UiZone = {
  id: string;
  kind: "ui" | "edge";
  /** What the platform draws there. */
  covers: string;
  rect: Rect;
};

export type PlatformSafeZones = {
  platform: SafeZonePlatform;
  label: string;
  /** The usable box: the frame minus every zone below. */
  safe: Rect;
  zones: UiZone[];
};

function zonesFor(platform: SafeZonePlatform, label: string, x0: number, x1: number, y0: number, y1: number, covers: { top: string; rail: string; bottom: string }): PlatformSafeZones {
  const { width: W, height: H } = SAFE_ZONE_FRAME;
  return {
    platform,
    label,
    safe: { left: x0, top: y0, width: x1 - x0, height: y1 - y0 },
    zones: [
      { id: "top-bar", kind: "ui", covers: covers.top, rect: { left: 0, top: 0, width: W, height: y0 } },
      { id: "right-rail", kind: "ui", covers: covers.rail, rect: { left: x1, top: y0, width: W - x1, height: y1 - y0 } },
      { id: "bottom-block", kind: "ui", covers: covers.bottom, rect: { left: 0, top: y1, width: W, height: H - y1 } },
      { id: "left-edge", kind: "edge", covers: "crop margin", rect: { left: 0, top: y0, width: x0, height: y1 - y0 } },
    ],
  };
}

/** Per-platform UI zones. Numbers match the per-platform table in docs/green-zone.md. */
export const PLATFORM_SAFE_ZONES: Record<SafeZonePlatform, PlatformSafeZones> = {
  tiktok: zonesFor("tiktok", "TikTok", 60, 960, 220, 1500, {
    top: "LIVE / Following / For You tabs and search",
    rail: "avatar, like, comment, save, share and sound disc",
    bottom: "username, caption, sound ticker and the tab bar",
  }),
  reels: zonesFor("reels", "Instagram Reels", 60, 960, 200, 1450, {
    top: "Reels title and camera button",
    rail: "like, comment, share, remix and audio buttons",
    bottom: "username, follow button, caption block and audio line",
  }),
  shorts: zonesFor("shorts", "YouTube Shorts", 80, 980, 180, 1520, {
    top: "search and overflow menu",
    rail: "like, dislike, comment, share and remix buttons",
    bottom: "channel name, subscribe button, title and sound",
  }),
};

/** One element measured at one sample time. */
export type ProbedElement = {
  selector: string;
  role: SafeZoneRole;
  text: string | null;
  rect: Rect;
};

export type ProbeSample = { t: number; elements: ProbedElement[] };

export type SafeZoneFinding = {
  platform: SafeZonePlatform;
  zone: string;
  zoneKind: "ui" | "edge";
  severity: "error" | "warning";
  role: SafeZoneRole;
  selector: string;
  text: string | null;
  rect: Rect;
  /** Overlap with the zone: px of intrusion and share of the element's area. */
  overlap: { px: number; share: number };
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  fix: string;
};

export type SafeZoneOptions = {
  platforms?: readonly SafeZonePlatform[];
  /** Px an element may cross into a zone before it counts (anti-aliasing, glyph overhang). */
  tolerance?: number;
};

function intersect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True when the element is entirely off the 1080x1920 canvas (parked off-screen for an entrance). */
export function isOffCanvas(r: Rect): boolean {
  const { width: W, height: H } = SAFE_ZONE_FRAME;
  return r.left >= W || r.top >= H || r.left + r.width <= 0 || r.top + r.height <= 0 || r.width < 1 || r.height < 1;
}

function severityFor(role: SafeZoneRole, zone: UiZone, share: number): "error" | "warning" | null {
  if (zone.kind === "edge") return "warning";
  if (role === "face" || role === "product") {
    // A face or product half-tucked under the rail still reads; most of it under the UI does not.
    if (share >= 0.2) return "error";
    if (share >= 0.05) return "warning";
    return null;
  }
  return "error";
}

function fixFor(zone: UiZone, p: PlatformSafeZones): string {
  const s = p.safe;
  switch (zone.id) {
    case "top-bar":
      return `Move it below y=${s.top} (${p.label} ${zone.covers}).`;
    case "bottom-block":
      return `Keep its bottom above y=${s.top + s.height} (${p.label} ${zone.covers}).`;
    case "right-rail":
      return `Keep its right edge left of x=${s.left + s.width} (${p.label} ${zone.covers}).`;
    default:
      return `Keep it right of x=${s.left} (${zone.covers}).`;
  }
}

/**
 * Check measured element boxes against platform UI zones. Findings are
 * collapsed across samples (same platform + zone + selector + text), keeping
 * the largest overlap and the first / last sample time it was seen.
 */
export function checkSafeZones(samples: ProbeSample[], opts: SafeZoneOptions = {}): SafeZoneFinding[] {
  const platforms = opts.platforms && opts.platforms.length > 0 ? opts.platforms : SAFE_ZONE_PLATFORMS;
  const tol = opts.tolerance ?? 4;
  const byKey = new Map<string, SafeZoneFinding>();
  for (const sample of samples) {
    for (const el of sample.elements) {
      if (isOffCanvas(el.rect)) continue;
      for (const pid of platforms) {
        const p = PLATFORM_SAFE_ZONES[pid];
        for (const zone of p.zones) {
          const hit = intersect(el.rect, zone.rect);
          if (!hit) continue;
          // Intrusion depth along the axis that separates the zone from the safe box.
          const px = zone.id === "top-bar" || zone.id === "bottom-block" ? hit.height : hit.width;
          if (px <= tol) continue;
          const share = (hit.width * hit.height) / Math.max(1, el.rect.width * el.rect.height);
          const severity = severityFor(el.role, zone, share);
          if (!severity) continue;
          const key = `${pid}|${zone.id}|${el.selector}|${el.text ?? ""}`;
          const prev = byKey.get(key);
          if (prev) {
            prev.lastSeen = Math.max(prev.lastSeen, sample.t);
            prev.firstSeen = Math.min(prev.firstSeen, sample.t);
            prev.occurrences += 1;
            if (px > prev.overlap.px) {
              prev.overlap = { px: round(px), share: round(share) };
              prev.rect = el.rect;
            }
            if (severity === "error") prev.severity = "error";
            continue;
          }
          byKey.set(key, {
            platform: pid,
            zone: zone.id,
            zoneKind: zone.kind,
            severity,
            role: el.role,
            selector: el.selector,
            text: el.text,
            rect: el.rect,
            overlap: { px: round(px), share: round(share) },
            firstSeen: sample.t,
            lastSeen: sample.t,
            occurrences: 1,
            fix: fixFor(zone, p),
          });
        }
      }
    }
  }
  const order = { error: 0, warning: 1 } as const;
  return [...byKey.values()].sort(
    (a, b) => order[a.severity] - order[b.severity] || a.firstSeen - b.firstSeen || a.selector.localeCompare(b.selector) || a.platform.localeCompare(b.platform),
  );
}

/** True when the box sits fully inside the platform safe box (used by layout slot tests). */
export function insideSafeBox(r: Rect, platform: SafeZonePlatform, tolerance = 0): boolean {
  const s = PLATFORM_SAFE_ZONES[platform].safe;
  return (
    r.left >= s.left - tolerance &&
    r.top >= s.top - tolerance &&
    r.left + r.width <= s.left + s.width + tolerance &&
    r.top + r.height <= s.top + s.height + tolerance
  );
}

/** Evenly spaced midpoint sample times across [0, duration] (same scheme as `hyperframes inspect`). */
export function sampleTimes(duration: number, samples: number): number[] {
  const n = Math.max(1, Math.floor(samples));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.round(((duration * (i + 0.5)) / n) * 1000) / 1000);
  return out;
}
