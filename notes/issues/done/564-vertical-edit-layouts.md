# Vertical (9:16) edit layouts and safe zones

> **Status:** done — 2026-10-30 (checkpoint: 8 vertical layouts as catalog items with slots and previews, platform UI safe zones as data, `ralphy editor lint-safe-zones`, placement guideline; gaps listed below)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / craft library

## Context

The owner wants edit layouts (split screen, green screen, element placement guidelines). Focus is vertical only for now.

## What

- A 9:16 layout set as HyperFrames compositions with slots: top/bottom split, gameplay or satisfying B-roll split, talking head over keyed background (uses #560), picture-in-picture, reaction, screen recording with face cam, full-bleed B-roll with caption band, text-led.
- Safe zones per platform UI (TikTok, Reels, Shorts): where captions, the face and key text must not go. Encode as a lint the editor runs on the composition.
- A placement guideline doc: face position, caption height, headline zone, product zone, CTA zone.
- Each layout added to the #563 catalog with a preview.

## Scope / acceptance

- At least 8 layouts with previews in the catalog.
- `ralphy editor lint-safe-zones <project>` flags elements in platform UI zones.
- Guideline at `.agents/skills/editor/references/vertical-layouts.md`.

## Notes

- Sequence after #563.

## Checkpoint (2026-10-30)

**Landed.**

- 8 layouts as catalog items of kind `layout` (`catalog/items/layout/<id>.html`, entries in `catalog/manifest.json`), each with typed params, a `slots` block (id, role, box in 1080x1920 px, fit, `keyed` for alpha cutouts, note), use / avoid notes and a rendered 9:16 preview under `.ralphy/catalog/previews/`: `layout-split-top-bottom`, `layout-gameplay-split`, `layout-keyed-talking-head` (alpha subject from `ralphy matte key|subject`, #560), `layout-pip`, `layout-reaction`, `layout-screen-facecam`, `layout-broll-caption-band`, `layout-text-led`. `ralphy catalog list --kind layout`, `ralphy catalog show <id>`.
- Schema: `slots` (layouts), `caption` (#565) and `camera` (#567) metadata blocks, each required for its kind; SFX is optional outside transitions and elements.
- Safe zones as data: `cli/lib/editor/safe-zones.ts` (`PLATFORM_SAFE_ZONES`: top bar, right rail, bottom block as UI zones, left edge as a margin) for TikTok, Reels and Shorts, matching the per-platform table in `docs/green-zone.md` (a test keeps them in sync).
- `ralphy editor lint-safe-zones <project|dir> [--platform ...] [--at t,...] [--samples n] [--tolerance px] [--strict]`: loads the composition in headless Chromium (Playwright), seeks the root timeline to each sample, honours clip windows (`data-start` / `data-duration`), measures every visible leaf text element plus elements tagged `data-safe-zone="face|product|cta|caption|text"` (`ignore` skips a subtree), and reports collapsed findings (platform, zone, severity, overlap, first / last seen, fix). Errors exit 1. A directory path runs without a Workspace (scope exemption in `cli/index.ts`), a project id resolves scope as usual. Zero provider calls.
- Guideline: `.agents/skills/editor/references/vertical-layouts.md` (layout picker; face, caption, headline, product, CTA and edge placement; how the lint decides), linked from the editor skill, `green-zone.md` and `motion-catalog.md`.
- Tests: `tests/unit/safe-zones.test.ts` (zone data, checker grading and collapse, every text / caption / CTA / face slot of every layout inside all three safe boxes), `tests/integration/cli-editor-safe-zones.test.ts` (headless probe on a stub-timeline fixture), `tests/unit/catalog-manifest.test.ts` (layout count, SFX optional), verb shapes for `editor.lint-safe-zones` and `catalog.show.layout`. All 8 layout builds and all 12 caption-preset builds (#565) pass the lint with zero findings at 30 to 60 samples. On the caption builds it caught two real overflows (a long Russian word in the slam preset's oversize entry and a pop overshoot pushing a three-word chunk under the right rail), fixed in the presets.

## Gaps after the checkpoint

- **Zone numbers.** The UI zones are rectangles from the green-zone table, not measured overlays of current app builds; the right rail is modelled full height and the bottom block full width. Measure real screenshots per platform (and per device class) and refine to the rail's real y-span.
- **Face detection.** The lint sees faces and products only when tagged `data-safe-zone`; it cannot find a face inside a `<video>`. A local face pass (MediaPipe from #559) on sampled frames would cover untagged footage.
- **Slot filling.** No `ralphy catalog use <layout> --project <id> --slot main=<file>`; agents replace placeholder children by hand (shared gap with #563).
- **Video plates.** Previews use DOM placeholder footage; no layout has been rendered with real `<video>` slots or a real alpha cutout in the keyed slot.
- **Other aspects.** 9:16 only; 4:5 and 1:1 feed variants and 16:9 are out of scope for now.
- **Scenario gate.** `scoreScenario()` still gates on the universal box only; it does not read the per-platform zones or the publish target.
- **CLI surface doc.** `docs/cli-surface.generated.md` not regenerated (owner instruction).
