# Green Zone — safe-area geometry

Where you can place text and UI elements on a 1080×1920 vertical video so the platform overlay (TikTok / Instagram Reels / YouTube Shorts) doesn't **cover** them.

Source: `dansugc/reelclaw/references/green-zone.md` + personal QA.

Used by:
- `src/lib/utils/green-zone.ts` — for Remotion compositions (`isInGreenZone`, `getTextPreset`).
- `cli/lib/score.ts` → `scoreScenario()` — gate before handoff out of `scenarist playbook`.
- `art-director playbook` while generating prompts.json — checks text overlay positions.

## Universal Green Zone (1080×1920)

```
   X=0          X=60                            X=960    X=1080
Y=0   ┌──────────────────────────────────────────────┐
      │ ❌ Top UI (username + sound)                  │
Y=210 ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤  ← Top edge of green zone
      │            ┌────────────────┐                │
      │            │                │  ❌ Right rail │
      │            │   ✅ SAFE      │  (engagement) │
      │            │   900 × 1270   │                │
      │            │                │                │
      │            └────────────────┘                │
Y=1480├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤  ← Bottom edge
      │ ❌ Bottom UI (caption + CTA)                  │
Y=1920└──────────────────────────────────────────────┘
```

**Universal box**: `{ x: 60..960, y: 210..1480 }` = **900 × 1270 px**.

## Per-platform variants

Use the universal box if a clip is published on multiple platforms. If targeting one — you can expand:

| Platform | xMin | xMax | yMin | yMax | Why |
|---|---|---|---|---|---|
| Universal (default) | 60 | 960 | 210 | 1480 | Safe everywhere |
| TikTok | 60 | 960 | 220 | 1500 | UI sits a bit higher at the bottom |
| Instagram Reels | 60 | 960 | 200 | 1450 | Caption block is wider |
| YouTube Shorts | 80 | 980 | 180 | 1520 | Minimal UI plates |

We only implement Universal (first generation). Per-platform comes if we add platform-targeted exports.

## Text position presets (for typical roles)

Use `getTextPreset(role)` from `src/lib/utils/green-zone.ts`:

| Role | Y | Font size | When |
|---|---|---|---|
| `hook` | 280 | 72px | First hook line, primary attention |
| `midUpper` | 380 | 56px | Subtitle / hook context |
| `supporting` | 1100 | 44px | Supporting copy in the lower third |
| `cta` | 1380 | 60px | Final call / link in bio |

Horizontally — centerX(textWidth) or `textAlign: center` on a full-width parent inside the zone.

## Hard fails (rejected by `scoreScenario()`)

Any `text_overlay` with these parameters **fails** the gate:

- `y < 210` — covered by the top UI overlay
- `y + height > 1480` — covered by the bottom caption block
- `x < 60` — clipped on the left
- `x + width > 960` — covered by the right engagement column

In a scenario use:
```jsonc
{
  "scenes": [{
    "id": "scene-01",
    "text_overlays": [
      { "role": "hook", "text": "When you push to main on Friday", "x": 60, "y": 280, "width": 900, "height": 120 }
    ]
  }]
}
```

## TikTok-Sans-style font weight ladder (for hierarchy)

For UGC video the text hierarchy matters more than the font choice. Standard ladder:

| Role | Weight | When |
|---|---|---|
| Hook headline | Black (900) | First 0–3s, dominant element |
| Hook supporting | Bold (700) | Second hook line / subtitle |
| Main caption | Medium (500) | Word-by-word body captions |
| CTA | Bold (700) | Finale call-to-action |

Our stack uses `@remotion/google-fonts` — for Russian we recommend **Inter** or **Onest** (both with Cyrillic and the required weights).

## Quick check

Import and use directly in a Remotion composition:

```tsx
import { GREEN_ZONE, getTextPreset, isInGreenZone } from "../../lib/utils/green-zone";

const HookText: React.FC<{ text: string }> = ({ text }) => {
  const preset = getTextPreset("hook");
  return (
    <div style={{
      position: "absolute",
      top: preset.y,
      left: GREEN_ZONE.xMin,
      width: GREEN_ZONE.width,
      textAlign: "center",
      fontSize: preset.fontSize,
      fontWeight: 900,
      color: "white",
      textShadow: "0 0 8px rgba(0,0,0,0.8)",
    }}>{text}</div>
  );
};
```

Or a dev-time check:

```ts
if (!isInGreenZone({ x: 600, y: 1500, width: 400, height: 60 })) {
  console.warn("Out of Green Zone — will be covered by platform UI");
}
```
