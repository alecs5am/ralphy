# Vertical layouts and placement (9:16)

> #564. Read when composing a 1080x1920 cut: which layout carries the story, where the face, captions, headline, product and CTA go, and how to check the result against TikTok, Reels and Shorts UI.

## Pick a layout first

Eight ready layouts live in the motion catalog as kind `layout`. Each is a HyperFrames fragment with named slots (`data-slot`), typed params and a rendered preview.

```bash
ralphy catalog list --kind layout
ralphy catalog show layout-pip            # slots with boxes, params, use / avoid
```

| Layout | Use it for | Avoid it when |
|---|---|---|
| `layout-split-top-bottom` | Before / after, A vs B, cause and effect | One subject needs the whole frame |
| `layout-gameplay-split` | Voice-led stories, commentary over a clip; the loop holds attention | Brand or premium work |
| `layout-keyed-talking-head` | Explainers over a screenshot, article or chart: green screen without a green screen | The matte cannot separate the speaker cleanly |
| `layout-pip` | Commentary over footage, walkthroughs | The main subject sits in the lower-left quarter |
| `layout-reaction` | Reacting to a clip, tweet or screenshot | The clip needs full-size detail |
| `layout-screen-facecam` | Tutorials, app and SaaS demos, code | Tiny UI text: crop and zoom the recording first |
| `layout-broll-caption-band` | Vlogs, documentary, voice-over B-roll | The subject sits at chest height |
| `layout-text-led` | Faceless explainers, quotes, lists, CTAs | Long voice-over stretches with no new motion |

Fill a slot by replacing its placeholder children with the real media (`<video>` with its own `id`, `data-start`, `data-track-index`; an `<img>` for stills). Keep the slot box: the geometry is what passed the safe-zone check. The keyed talking head expects an alpha cutout from `ralphy matte key <green.mp4>` or `ralphy matte subject <clip.mp4>` (see [`keying-and-matting.md`](./keying-and-matting.md)).

## Placement rules

All numbers are composition px on 1080x1920. When a cut ships to several platforms, design for the intersection of their safe boxes: **x 80..960, y 220..1450**.

- **Face.** Eyes at roughly one third of the frame height (y 560..760) for a full-frame talking head. Never let the platform UI cover more than a sliver of a face: the right rail starts at x 960, the bottom block at y 1450 on Reels. In split layouts keep the face in the middle third of its half so the seam never cuts a chin.
- **Captions.** Burned-in captions live between y 1100 and 1450 (chest height) or, when the lower frame is busy, in the top safe zone at y 260..420. Never below 1450: Reels draws its caption block there. Keep 1 to 5 words per screen (presets: `ralphy catalog list --kind caption`).
- **Headline / hook.** y 260..700, left-aligned at x 80 or centred on 540. The first frame's hook must not sit under the top bar (TikTok tabs end at y 220).
- **Product.** The hero product sits in the centre band (y 600..1300), clear of the right rail. A product half under the rail reads as an accident.
- **CTA.** y 1250..1440, left of x 960. A CTA under the bottom block is invisible on every platform.
- **Edges.** Keep text 80 px from the left edge (Shorts crops more than TikTok). Edge margins are warnings, UI zones are errors.

## Check it

```bash
ralphy editor lint-safe-zones <project>                         # all three platforms
ralphy editor lint-safe-zones <project> --platform reels --at 0.4,2,5.5
ralphy editor lint-safe-zones .ralphy/catalog/build/layout-pip  # any directory with an index.html
```

The lint loads `index.html` in headless Chromium, seeks the timeline to sample times (9 midpoints by default), and measures every visible text element plus anything tagged `data-safe-zone="face|product|cta|caption|text"`. Text, captions and CTAs inside a UI zone are errors; a face or product is an error when 20 percent or more of it is under the UI. It exits 1 on errors (`--strict` also on warnings). Tag decorative or intentionally off-frame text `data-safe-zone="ignore"`, and tag faces and products so the lint can see them: it cannot find a face in pixels.

Entrances count: an element that slides in through the bottom block is flagged at the sample that catches it there. Prefer entrances that stay inside the safe box (fade, scale, short offsets).

## Data

- Zones: `cli/lib/editor/safe-zones.ts` (`PLATFORM_SAFE_ZONES`), mirrored in [`docs/green-zone.md`](../../../../docs/green-zone.md).
- Layout slots: the `slots` block of each `layout-*` entry in `catalog/manifest.json`; `tests/unit/safe-zones.test.ts` keeps every text, caption, CTA and face slot inside all three safe boxes.
