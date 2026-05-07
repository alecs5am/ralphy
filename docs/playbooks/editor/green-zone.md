# Green zone

Geometry for text overlays and captions in 1080×1920 9:16 video.

## Universal Green Zone

- **X:** 60 → 960 (60px slider from each edge of the 1080px width)
- **Y:** 210 → 1480 (top-bar UI ~210px, bottom UI ~440px on TikTok)

Any text or CTA element must lie entirely inside `[60..960, 210..1480]`.

## Per-platform variants

| Platform | Top safe | Bottom safe | Notes |
|---|---|---|---|
| TikTok | 210 | 440 | Most aggressive bottom UI |
| Reels (Instagram) | 200 | 360 | Slightly more lenient |
| Shorts (YouTube) | 180 | 320 | Most liberal |

**Default — TikTok** (unless specified otherwise). What passes on TikTok will pass everywhere.

## Text position presets

| Role | Y-range | Font-size baseline (vh%) |
|---|---|---|
| Hook | 280–340 | 7-9% (large, attention-grab) |
| Upper-mid | 360–440 | 5-6% (supporting context) |
| Supporting | 1100 | 4-5% (mid-flow text) |
| CTA | 1380 | 5-6% (call to action) |

## Hard fails

- `y < 210` → covered by top bar (avatar, follow button, handle).
- `y > 1480` → covered by bottom controls (caption text, like/comment, music attribution).
- `x > 960` → may clip on right edge.

## Burned-in captions

With `burnSubtitles` the default `marginV: 90` = Y 1830. **This is inside the universal zone** (1480 + 90 = 1570... wait, marginV is measured from the bottom, so Y_actual = 1920 - 90 = 1830). 1830 > 1480 → outside the hard zone.

Fix: for captions, default `marginV: 440` (Y_actual = 1480) or less — inside the universal zone. If the template requires TikTok-style captions lower down — `marginV: 90` BUT only if a user-test passed OK.

## Validation

Helper: `src/lib/utils/green-zone.ts`:
```ts
import { isInGreenZone, getTextPreset, GREEN_ZONE } from "@/lib/utils/green-zone";

isInGreenZone({ x: 540, y: 300, w: 400, h: 60 }); // true
getTextPreset("hook"); // { y: 310, fontSize: 8 }
```

`scoreScenario()` (see `quality-gate.md`) uses `isInGreenZone()` to validate every `text_overlay` scene in scenario.json.
