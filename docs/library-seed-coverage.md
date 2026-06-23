# Library seed-Unit coverage audit

> **Status:** living audit. Grounded against `landing/lib/library-v2/library.json` (the committed content store) + the supported content modes in `cli/lib/content-modes.ts`.
> **Tracks:** [`../notes/issues/done/447-library-seed-units-pack.md`](../notes/issues/done/447-library-seed-units-pack.md)
> **Grounded as of:** 2026-06-23.

The mode system + benchmarks + user trust need real example Units in the library. This audit maps what the library ALREADY carries against the supported content modes, so the remaining curation is a known shortlist rather than a guess. Regenerate the counts with `jq '.units | group_by(.format)[] | "\(.[0].format): \(length)"' landing/lib/library-v2/library.json`.

## 1. What the library already carries (42 units)

| Format | Units | Notes |
|---|---|---|
| video | 24 | The deepest tier — but clustered: 7 are `choose-your-path-gauntlet`, 5 `product-reveal`. |
| carousel | 6 | The `multi-style-carousel-*` set (acid/club/punk/riso/swiss/zine). |
| poster | 3 | `streetwear-drop-poster-*`. |
| motion-design | 3 | `live-platform-motion-ad`, `ship-announcement`, `animated-fb-ad`. |
| sticker-pack | 3 | `nyastics-emotes-final`, `vpn-sticker-pack-{clean,outline}`. |
| fb-creative | 2 | `dev-tool-fb-creative-pack`, `silent-square-site-ad`. |
| image | 1 | `voxel-fork` only. |

**The seed pack substantially exists** — every format #447 enumerates (video, image-pack, carousel, poster, motion-design) has at least one representative, and video/carousel are well-stocked.

## 2. Coverage by supported content mode

The 21 supported modes (`isModeSupported`) map to a media format via `expectedUnitShape.format`. A mode is *covered* when the library has a Unit that reads as a faithful example of it.

| Mode | Format | Seed example | Coverage |
|---|---|---|---|
| social-carousel | carousel | `multi-style-carousel-*` (6) | strong |
| ad-creative-pack | fb-creative | `dev-tool-fb-creative-pack` | covered |
| motion-design | motion-design | `animated-fb-ad`, `live-platform-motion-ad` | covered |
| podcast-video | video | `podcast-explainer-longform` | covered |
| tv-ad | video | `food-beverage`, `nothing-hp1-001` (product-reveal) | covered |
| ugc-review | video | partial — `glitter-cream-001` (before-after) is adjacent | thin |
| product-shot | image | `voxel-fork` is the only still | **gap** |
| lifestyle-scene | image | — | **gap** |
| closeup-product-with-person | image | — | **gap** |
| pinterest-pin | image | — | **gap** |
| hero-banner | image | — | **gap** |
| virtual-model-tryout | image | — | **gap** |
| conceptual-product | image | `voxel-fork` adjacent | thin |
| restyle | image | — | **gap** |
| amazon-listing | image | — | **gap** |
| tutorial-ugc | video | — (no clear tutorial seed) | **gap** |
| unboxing-ugc | video | — | **gap** |
| cartoon-animation | video | `skater-spiderverse-001` adjacent | thin |
| typography-animation | motion-design | `ship-announcement` adjacent | thin |
| infographic-animation | motion-design | — | **gap** |
| personal-clipper | video | — (new mode, #436) | **gap** |

## 3. The gap + curation shortlist

The clear gaps cluster in **still-image modes** (the library has 1 dedicated `image` Unit; poster + sticker-pack are distinct formats) and a few **video modes** (tutorial-ugc, unboxing-ugc, personal-clipper). Priority shortlist to bring each gap to one strong seed:

1. **Still-image modes** — promote the strongest existing image-pack / poster projects (e.g. the photoreal `noski-people` work, the `bio_fix` specimen renders, the `free-air` mascot stills) into `product-shot` / `lifestyle-scene` / `hero-banner` seeds.
2. **tutorial-ugc / unboxing-ugc** — the niche craft-overlay skills exist; promote a shipped example once one is produced.
3. **personal-clipper** — brand new (#436); needs a first clipped-from-source example.
4. **infographic-animation** — promote a data-driven motion-design project when available.

## 4. How to actually publish a seed (the gated step)

Forming + publishing a seed Unit is the existing path, NOT a special one:

1. `ralphy unit create <project> --slug <s> --format <f> --from "<glob>"` — form the Unit locally (COPIES curated `artifacts/`, #069).
2. `ralphy project scorecard <project>` — validate readiness (#427) before it represents the mode.
3. The `templater` skill extracts + classifies into the 5 entities, then `landing/scripts/publish-entity.ts --unit <dir>` pushes to the library.

**Step 3 is outward-facing** — it uploads media to the Bunny CDN and edits the committed `library.json`. That CDN push (cost + public permanence) is left to a maintainer with creds + media-quality judgment; this audit is the curation map it works from. `bun run lint:library:fast` keeps every published entry referentially honest (#448).

## 5. What this audit does NOT do

It does not publish anything (no Bunny upload, no `library.json` edit). It is the committed, regenerable coverage map + shortlist — the seed pack itself already exists (42 units, §1); this names where to deepen it.
