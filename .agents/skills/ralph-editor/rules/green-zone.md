# Green zone

Geometry для text overlays и captions в 1080×1920 9:16 видео.

## Universal Green Zone

- **X:** 60 → 960 (slider 60px от каждого края на 1080px ширине)
- **Y:** 210 → 1480 (top-bar UI ~210px, bottom-UI ~440px на TikTok)

Любой текст или CTA-element должен лежать целиком внутри `[60..960, 210..1480]`.

## Per-platform variants

| Platform | Top safe | Bottom safe | Notes |
|---|---|---|---|
| TikTok | 210 | 440 | Most aggressive bottom UI |
| Reels (Instagram) | 200 | 360 | Чуть более лояльны |
| Shorts (YouTube) | 180 | 320 | Самые либеральные |

**Default — TikTok** (если не указано иное). На TikTok пройдёт везде.

## Text position presets

| Role | Y-range | Font-size baseline (vh%) |
|---|---|---|
| Hook | 280–340 | 7-9% (большие, attention-grab) |
| Upper-mid | 360–440 | 5-6% (supporting context) |
| Supporting | 1100 | 4-5% (mid-flow text) |
| CTA | 1380 | 5-6% (call to action) |

## Hard fails

- `y < 210` → закроется top bar (avatar, follow button, ник).
- `y > 1480` → закроется bottom controls (caption text, like/comment, music attribution).
- `x > 960` → may clip on right edge.

## Burned-in captions

При `burnSubtitles` дефолт `marginV: 90` = Y 1830. **Это внутри universal zone** (1480 + 90 = 1570... wait, marginV считается от bottom, поэтому Y_actual = 1920 - 90 = 1830). 1830 > 1480 → outside hard zone.

Решение: для captions дефолт `marginV: 440` (Y_actual = 1480) или меньше — внутри universal zone. Если шаблон требует TikTok-стиль captions ниже — `marginV: 90` но ТОЛЬКО под условием что user-test прошёл OK.

## Validation

Helper: `src/lib/utils/green-zone.ts`:
```ts
import { isInGreenZone, getTextPreset, GREEN_ZONE } from "@/lib/utils/green-zone";

isInGreenZone({ x: 540, y: 300, w: 400, h: 60 }); // true
getTextPreset("hook"); // { y: 310, fontSize: 8 }
```

`scoreScenario()` (см. `quality-gate.md`) использует `isInGreenZone()` для проверки всех `text_overlay` сцен в scenario.json.
