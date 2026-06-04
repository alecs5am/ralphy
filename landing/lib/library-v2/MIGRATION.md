# Library v2 — migration report

This is the human-readable report for the build-time migration of every existing
library entity into the Library v2 Unit/Block graph (see `catalog.ts` for the
output, `types.ts` for the model, `index.ts` for the loader).

The graph has five entities: **Format**, **Unit**, and three single/multi block
kinds — **Template** (structure-only skeleton), **Style** (aesthetic register),
**Recipe** (composable treatment), **Asset** (concrete media, by `sub`). A Unit =
exactly 1 Template + 1 Style + N Recipes + M Assets, in a Format.

**Key rule applied:** Templates and Guidelines became **Blocks**, not Units. A
Unit must have real rendered media on disk. The only sources of real media are
the `landing/public/showcase/<slug>/` folders and the homepage `clips` in
`landing/lib/data.tsx`. So the 64 `template.yaml` files and 4 guidelines fed the
**block vocabulary**, and the 15 showcase folders + every homepage hero clip
became the Units.

**Correction (2026-06):** the first pass wrongly excluded the v1 `HIDE_SLUGS`
clips from the Unit set. `HIDE_SLUGS` is a *homepage-hero-wall* lean-up filter —
it collapses hero clips that duplicate a template category so the marketing hero
stays tight. In a UNITS feed that reasoning does not hold: each produced clip
has real rendered media on disk and so is a legitimate Unit. The 12 formerly
hidden clips (`noski-people-001`, `analog-horror-fridge-001`,
`ralphy-vs-higgsfield-001`, `flipper-hypermotion-001`, `occult-mockumentary-001`,
`fruit-drama-001`, `playdate-pixel-001`, `kbo-broadcast-001`, `tokyo-y2k-001`,
`skater-spiderverse-001`, `arena-rocker-001`, `glitter-cream-001`) are now
surfaced as Units, taking the total to **28**. Provenance reuses EXISTING blocks
only (no new blocks were invented); the per-clip mapping follows the template
classification table in section (d).

**Review fix-pass (2026-06):** four further corrections to the Unit set, taking
the total from 28 to **33**:

1. **`multi-style-carousel` split into 6 per-aesthetic carousel units.** The one
   carousel unit hid 6 distinct aesthetics on disk (acid / club / punk / riso /
   swiss / zine, 5 real slides each). The model allows exactly one Style per
   Unit, so each look is now its own carousel unit — `multi-style-carousel-acid`
   (`acid-graphics`), `-club` (`club-flyer`), `-punk` (`punk-collage`), `-riso`
   (`risograph`), `-swiss` (`swiss-editorial`), `-zine` (`zine-cutout`), each
   `mediaCount` 5 with its real 5 slides. Net +5 units. This resolves the
   one-Style lossy edge flagged in section (e) item 2.
2. **`vpn-sticker-pack` split into 2 looks.** Disk has 32 `clean-*` and 32
   `outline-*` stills. Now two pack units — `vpn-sticker-pack-clean`
   (`cel-cartoon`) and `vpn-sticker-pack-outline` (`risograph`, the paper-grain
   riso variant), each `mediaCount` 32 with 12 real slides wired so the tile grid
   and the viewer strip read full. Net +1 unit. Resolves section (e) item 3.
3. **`vs-comparison-ad` dropped.** Its render is a low-res 12s crop of the SAME
   doors / "Pick a door." footage as `ralphy-vs-higgsfield-001` (frames + probe
   confirmed identical content). The doors clip is correctly a
   `choose-the-door` / `analog-horror` unit; the duplicate `versus` unit is
   removed. Net −1 unit.
4. **Four new Style blocks added** (21 → 25): `risograph`, `club-flyer`,
   `punk-collage`, `zine-cutout` — the carousel aesthetics that did not already
   have a register. `acid-graphics` and `swiss-editorial` were reused.

Also: single-item video/poster/image tiles now hide the placeholder play-badge /
shimmer / corner-glyph when real media exists; pack tiles size their grid to the
media actually present (no empty trailing cells); the FB pack now wires 12 real
slides for a full grid + deeper viewer strip.

---

## (a) Units per format

| Format | Units | Notes |
|---|---|---|
| video | 19 | brainrot, broadcast, food-beverage, found-footage, podcast-explainer, soviet-nostalgic, nothing-hp1 + the 12 formerly-hidden hero clips (noski-people, analog-horror-fridge, ralphy-vs-higgsfield, flipper-hypermotion, occult-mockumentary, fruit-drama, playdate-pixel, kbo-broadcast, tokyo-y2k, skater-spiderverse, arena-rocker, glitter-cream). `vs-comparison-ad` dropped as a doors duplicate of `ralphy-vs-higgsfield-001`. |
| motion-design | 3 | animated-fb-ad, live-platform, ship-announcement |
| fb-creative | 2 | dev-tool-fb-pack (32 stills, 12 wired), silent-square-site-ad |
| carousel | 6 | multi-style-carousel split per aesthetic: -acid, -club, -punk, -riso, -swiss, -zine (5 real slides each) |
| poster | 1 | streetwear-drop-poster (3 variants) |
| sticker-pack | 2 | vpn-sticker-pack split into -clean (cel-cartoon) and -outline (risograph), 32 stills each / 12 wired |
| podcast-cuts | 0 | no rendered podcast-cut media on disk yet (format kept in taxonomy, count 0) |
| image | 0 | no single-still `image`-format render hosted yet (guidelines are blocks, not Units) |
| **Total** | **33** | |

`mediaCount` is the real on-disk file count for the packs/carousels/sets
(dev-tool = 32, multi-style = 30, vpn = 64, streetwear = 3); single-clip/still
formats default to 1. `media[]` carries the real public paths; for the heavy
packs a representative 4-item subset is wired (the full set lives on disk).

---

## (b) Blocks per kind

| Kind | Count | Dedupe ratio (real entities → blocks) |
|---|---|---|
| template (structure) | 25 | 64 templates → 25 structure blocks (~2.6:1) |
| style (register) | 25 | 64 templates + 4 guidelines → 21 styles (~3.2:1), + 4 carousel-aesthetic styles added in the review fix-pass (`risograph`, `club-flyer`, `punk-collage`, `zine-cutout`) |
| recipe (treatment) | 16 | attached only where implied; not 1:1 with any entity |
| asset (by sub) | 19 | from the asset pool + named anchors (6 character · 5 location · 4 prop · 4 music) |

The dedupe is the point: e.g. the structure block `product-reveal` backs the
real templates `product-360`, `multi-scene-product-launch`, `ecommerce-ad`,
`japanese-hypermotion-product-ad`, `cgi-hardware`, `food-beverage`,
`streetwear-drop-poster`, and the `nothing-hp1` hero. The style block `photoreal`
backs every realistic-register template (UGC selfie, try-on, fit-check,
testimonial, real-estate, comparison, …).

---

## (c) Full block list (id + name)

### Template blocks (25)

`choose-the-door` Choose the Door · `before-after` Before / After · `tier-list`
Tier List · `versus` Versus · `countdown` Countdown list · `reaction-stack`
Reaction stack · `testimonial` Testimonial · `product-reveal` Product reveal ·
`pov-walk` POV walk · `explainer` Explainer · `talking-head` Talking head ·
`story-time` Story time · `grwm` Get-ready-with-me · `unboxing` Unboxing /
reveal · `interview-duo` Interview duo · `music-video` Music video ·
`asmr-sensory` ASMR sensory · `lifestyle-montage` Lifestyle montage ·
`fb-creative-pack` FB creative pack · `sticker-set` Sticker set · `carousel-deck`
Carousel deck · `motion-card` Motion card · `showcase-wall` Showcase wall ·
`pov-narrative` POV narrative · `walkthrough-tour` Walkthrough tour

### Style blocks (21)

`photoreal` Photoreal · `photoreal-portrait` Photoreal portrait · `cinematic`
Cinematic film · `commercial-bright` Commercial bright · `cgi-render` CGI render
· `3d-cgi` 3D / CGI · `anime-action` Anime action · `cel-cartoon` Cel cartoon ·
`comic-panel` Comic panel · `pixel-art` Pixel art · `analog-horror` Analog horror
· `found-footage` Found footage · `soviet-propaganda` Soviet propaganda ·
`soviet-nostalgic` Soviet nostalgic · `y2k-streetwear` Y2K streetwear ·
`acid-graphics` Acid graphics · `swiss-editorial` Swiss editorial ·
`italian-brainrot` Italian brainrot · `brainrot-split` Brainrot split-screen ·
`fashion-editorial` Fashion editorial · `kinetic-typography` Kinetic typography

### Recipe blocks (16)

`rain-overlay` · `lantern-glow` · `voxel-dither` · `noir-grade` · `vhs-overlay` ·
`chroma-split` · `film-grain` · `halftone` · `light-leak` · `crt-scanlines` ·
`speed-ramp` · `bloom` · `broadcast-square` · `burned-captions` · `halation` ·
`typewriter-reveal`

### Asset blocks (19, by sub)

- **character (6):** `tralalero-tralala`, `bombardiro-crocodilo`,
  `ballerina-cappuccina`, `chimpanzini-bananini`, `vpn-mascot`, `doctor-authority`
- **location (5):** `studio-cyc`, `tokyo-alley`, `soviet-plaza`,
  `mockumentary-room`, `product-set`
- **prop (4):** `hero-product`, `energy-drink`, `gameplay-loop`, `brand-stickers`
- **music (4):** `trend-soviet-bed`, `horror-bed`, `electronic-beat`, `lofi-bed`

The 4 italian-brainrot characters are a representative subset of the 33 in
`docs/assets-catalog.md`; the full pool can be wired later without changing the
shape. The 27 trend-music tracks collapse to `horror-bed` (the recognizable
dread register) plus the template-required `trend-soviet-bed`.

---

## (d) Entity → block classification

### The 16 Units (real media) and their provenance

| Unit (slug) | Format | Template | Style | Recipes | Assets |
|---|---|---|---|---|---|
| animated-fb-ad | motion-design | showcase-wall | kinetic-typography | typewriter-reveal, bloom | brand-stickers |
| brainrot-ai-meme | video | story-time | brainrot-split | burned-captions | gameplay-loop |
| broadcast-caught-on-tv-square | video | lifestyle-montage | photoreal | broadcast-square | — |
| dev-tool-fb-creative-pack | fb-creative | fb-creative-pack | photoreal-portrait | film-grain | studio-cyc, doctor-authority |
| food-beverage | video | product-reveal | commercial-bright | speed-ramp, bloom | hero-product, product-set |
| found-footage-mockumentary | video | story-time | found-footage | vhs-overlay, film-grain, noir-grade | mockumentary-room, horror-bed |
| live-platform-motion-ad | motion-design | motion-card | kinetic-typography | bloom, chroma-split | electronic-beat |
| multi-style-carousel | carousel | carousel-deck | acid-graphics | halftone, chroma-split | vpn-mascot |
| podcast-explainer-longform | video | explainer | swiss-editorial | burned-captions | lofi-bed |
| ship-announcement | motion-design | motion-card | kinetic-typography | typewriter-reveal | — |
| silent-square-site-ad | fb-creative | motion-card | swiss-editorial | typewriter-reveal | brand-stickers |
| soviet-nostalgic | video | lifestyle-montage | soviet-nostalgic | vhs-overlay, film-grain | trend-soviet-bed |
| streetwear-drop-poster | poster | product-reveal | y2k-streetwear | halftone | brand-stickers |
| vpn-sticker-pack | sticker-pack | sticker-set | cel-cartoon | bloom | vpn-mascot |
| vs-comparison-ad | video | versus | photoreal | speed-ramp, burned-captions | hero-product |
| nothing-hp1-001 (hero) | video | product-reveal | commercial-bright | speed-ramp, bloom | hero-product |

### The 64 templates → block classification (templates are Blocks, not Units)

Each template contributed its STRUCTURE to a template block, its REGISTER to a
style block, and (where implied) recipes/assets. The showcase-backed templates
(15) are listed above as Units; the rest contribute block vocabulary only.

| Template (slug) | Format | Template block | Style block | Implied recipes |
|---|---|---|---|---|
| animated-fb-ad | motion-design | showcase-wall | kinetic-typography | typewriter-reveal, bloom |
| brand-story | video | story-time | cinematic | film-grain, halation |
| dev-tool-fb-creative-pack | fb-creative | fb-creative-pack | photoreal-portrait | film-grain |
| faceless-voiceover | video | explainer | swiss-editorial | burned-captions |
| interview-dialog | video | interview-duo | photoreal | — |
| listicle | video | countdown | swiss-editorial | burned-captions |
| motion-design-ad | motion-design | motion-card | kinetic-typography | bloom |
| ship-announcement | motion-design | motion-card | kinetic-typography | typewriter-reveal |
| silent-square-site-ad | fb-creative | motion-card | swiss-editorial | typewriter-reveal |
| tutorial-how-to | video | explainer | photoreal | burned-captions |
| vs-comparison-ad | video | versus | photoreal | speed-ramp, burned-captions |
| yap-talking-head | video | talking-head | photoreal | burned-captions |
| 3d-cgi | video | product-reveal | 3d-cgi | bloom |
| anime-action | video | music-video | anime-action | speed-ramp |
| cartoon | video | story-time | cel-cartoon | speed-ramp |
| cgi-architecture | video | walkthrough-tour | cgi-render | bloom |
| cinematic | video | story-time | cinematic | film-grain, halation, noir-grade |
| fight-scenes | video | versus | anime-action | speed-ramp, chroma-split |
| japanese-hypermotion-product-ad | video | product-reveal | cgi-render | speed-ramp, bloom |
| real-estate | video | walkthrough-tour | photoreal | bloom |
| tokyo-y2k-cinematic | video | pov-walk | cinematic | rain-overlay, noir-grade, bloom |
| active-lifestyle | video | lifestyle-montage | photoreal | speed-ramp |
| green-screen-explainer | video | explainer | photoreal | burned-captions |
| grwm | video | grwm | photoreal | burned-captions |
| noski-deadpan-2hander | video | talking-head | photoreal-portrait | — |
| photo-dump | video | lifestyle-montage | photoreal | film-grain, light-leak |
| podcast-clip | video | interview-duo | photoreal | burned-captions, speed-ramp |
| podcast-explainer-longform | video | explainer | swiss-editorial | burned-captions |
| pov-first-person | video | pov-walk | photoreal | — |
| social-hook | video | talking-head | photoreal | burned-captions |
| storytime | video | story-time | photoreal | burned-captions |
| talking-head-rant | video | talking-head | photoreal-portrait | burned-captions |
| before-after-product | video | before-after | commercial-bright | speed-ramp |
| cgi-hardware | video | product-reveal | cgi-render | bloom |
| doctor-authority | video | testimonial | photoreal | burned-captions |
| ecommerce-ad | video | product-reveal | commercial-bright | speed-ramp, bloom |
| fashion-lookbook | video | lifestyle-montage | fashion-editorial | light-leak |
| fit-check | video | lifestyle-montage | fashion-editorial | speed-ramp |
| food-beverage | video | product-reveal | commercial-bright | speed-ramp, bloom |
| life-changing-testimonial | video | testimonial | photoreal | burned-captions |
| multi-scene-product-launch | video | product-reveal | commercial-bright | speed-ramp, bloom |
| product-360 | video | product-reveal | cgi-render | bloom |
| streetwear-drop-poster | poster | product-reveal | y2k-streetwear | halftone |
| try-on | video | grwm | fashion-editorial | speed-ramp |
| ugc-selfie-product-review | video | talking-head | photoreal-portrait | burned-captions |
| vpn-sticker-pack | sticker-pack | sticker-set | cel-cartoon | bloom |
| ai-avatar | video | talking-head | photoreal | burned-captions |
| ai-drama | video | pov-narrative | commercial-bright | speed-ramp |
| ai-vegetables | video | pov-narrative | commercial-bright | speed-ramp |
| analog-horror-pick-a-door | video | choose-the-door | analog-horror | vhs-overlay, chroma-split, film-grain |
| analog-horror-psa | video | explainer | analog-horror | vhs-overlay, chroma-split, film-grain |
| anthropomorphic-object-drama | video | pov-narrative | 3d-cgi | bloom |
| asmr-sensory | video | asmr-sensory | photoreal | — |
| brainrot-ai-meme | video | story-time | brainrot-split | burned-captions |
| broadcast-caught-on-tv-square | video | lifestyle-montage | photoreal | broadcast-square |
| comic-to-video | video | music-video | comic-panel | halftone, chroma-split, speed-ramp |
| found-footage-mockumentary | video | story-time | found-footage | vhs-overlay, film-grain, noir-grade |
| italian-brainrot | video | pov-narrative | italian-brainrot | burned-captions |
| live-platform-motion-ad | motion-design | motion-card | kinetic-typography | bloom, chroma-split |
| multi-style-carousel | carousel | carousel-deck | acid-graphics | halftone, chroma-split |
| music-video | video | music-video | cinematic | speed-ramp, light-leak |
| soviet-nostalgic | video | lifestyle-montage | soviet-nostalgic | vhs-overlay, film-grain |
| tier-list | video | tier-list | swiss-editorial | burned-captions |
| trending-sound-remix | video | music-video | photoreal | speed-ramp |

### The 4 guidelines → style blocks (guidelines are an invisible engine layer; they become Style blocks)

| Guideline (slug) | kind | Style block |
|---|---|---|
| cgi-product-renders | image-prompt | cgi-render |
| cinematic-90s-film | image-prompt | cinematic |
| photoreal-studio-portraits | image-prompt | photoreal-portrait |
| y2k-streetwear-poster | image-prompt | y2k-streetwear |

Per the design handoff, Guidelines & Skills are NOT surfaced in the v2 UI — they
are the engine layer. They are recorded here as the provenance of four style
blocks rather than as their own entities.

---

## (e) Entities that could NOT be confidently classified (flagged, not guessed)

1. **`podcast-clip` vs the `podcast-cuts` format.** The `podcast-clip` template
   (creator-lifestyle) describes cutting clips FROM a long-form podcast — exactly
   the `podcast-cuts` format's intent. But no `podcast-cuts` Unit exists because
   no multi-cut podcast media is hosted on disk. The template was classified as a
   block (`interview-duo` / `photoreal`); the `podcast-cuts` format stays in the
   taxonomy with count 0 until real cut media lands. The single
   `podcast-explainer-longform` showcase is a long-form *explainer* video (one
   clip), so it maps to `video`, not `podcast-cuts`.

2. **`multi-style-carousel` single-Style limitation.** The real render spans six
   distinct aesthetics (acid, club, swiss, riso, punk, clean), but the model
   allows exactly one Style per Unit. Classified under `acid-graphics` (the cover
   set) — this is a known lossy edge: a multi-style carousel does not fit the
   "1 Style" axis cleanly. Flagging rather than inventing a `multi-style` pseudo-
   style block.

3. **`vpn-sticker-pack` two-look pack.** The 64 stills are a `cel-cartoon` clean
   set plus a riso variant. Same one-Style limitation as above; classified under
   `cel-cartoon` (the lead set). The riso half is unrepresented in provenance.

4. **The `lantern-fork` worked example was NOT created.** The design handoff's
   hero example (`lantern-fork`, voxel-night-rain) has no real media on disk, so
   per the rules it was not fabricated. Its illustrative blocks
   (`choose-the-door`, `voxel-night-rain`, `rain-overlay`, `lantern-glow`,
   `voxel-dither`, the armadillo/gnome characters) were NOT added to the catalog
   because nothing real references them — adding orphan blocks would inflate the
   swap menus with un-producible options. `choose-the-door` survives only because
   the real `analog-horror-pick-a-door` template backs it.

5. **`brand-stickers` is a prop, not a character pool.** The site-ad / showcase
   templates "dump brand stickers onto the canvas" — these are brand-extracted
   asset stickers, not a mascot character. Classified as `prop` (`brand-stickers`)
   rather than `character`, since they are not a recurring named entity.

---

## Constraints honored

- **English-only on disk** — verified with `rg '\p{Cyrillic}' --pcre2
  landing/lib/library-v2/` → empty.
- **Additive only** — new `landing/lib/library-v2/` dir; no v1 loader,
  `template.yaml`, or `workspace/` artifact was edited.
- **No fabricated media** — every `media[]` path points at a file that already
  exists under `landing/public/showcase/` or `landing/public/assets/showcase/`.
- **Typecheck** — `cd landing && bunx tsc --noEmit` exits 0.

## Read-path verification (#097, 2026-06-04)

Audited after the Supabase-as-source work (#084) landed. The contract: every
`/library` surface resolves its data through the single `source.ts` adapter,
which reads the **live Supabase DB when `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set**, and otherwise falls back to the
committed static mirror (`catalog.ts` + `published.ts`). No surface bypasses it.

| Surface | File | Fetches via |
|---|---|---|
| Main feed | `app/library/page.tsx` | `source.ts`: `getFormats`, `getUnits`, `getBlocks`, `counts`, `fmtCounts` (+ tag facet derived from the loaded units, #093) |
| Unit page | `app/library/u/[id]/page.tsx` | `source.ts`: `getUnit`, `getBlock`, `getBlocks`, `getUnits`, `getBlueprint`, `getFormats`, `formatById` |
| Block page | `app/library/b/[kind]/[id]/page.tsx` | `source.ts`: `getBlock`, `getBlocks`, `getFormats`, `unitsUsing` |
| Client islands (LibraryListing, MoreFrom, BlueprintCta, AssetMedia, …) | — | Receive resolved data as plain-JSON props from the server pages; they do NOT fetch. |

Findings:
- **No bypass.** `rg 'library-v2/(catalog\|published\|index)"\|@supabase/supabase-js\|createClient' app/library` → empty. Nothing under `app/library/` imports the static catalog/published/index barrels or `@supabase/supabase-js` directly.
- **Single adapter, uniformly branched.** Every `source.ts` getter (`getFormats`, `getBlocks`, `getUnits`, `getUnit`, `getBlock`, `unitsUsing`, `applicable*`, `counts`, `fmtCounts`, `getBlueprint`) guards on `isSupabaseBacked()` → `loadGraph()` (live) else the `STATIC_*` fallback. One code path, two stores, identical shapes.
- **Mirror role reconciled.** `catalog.ts` + `published.ts` are the **offline fallback only** (OSS clone / no-creds CI). `published.ts` was refreshed to the live snapshot in #098 (42 units), so the no-creds build now matches prod. The live site reads live Supabase.
- **Conclusion:** the entire library reads through `source.ts`; the static mirror is a documented snapshot fallback, not a divergent path. No remediation needed.

## Component-system audit (#086, 2026-06-04)

The `/library` surface grew page-by-page; media, unit tiles, audio, and rails
were copy-pasted with drift. The #087–#097 batch factored the repeated UI into a
small set of shared components on a common shadcn base. After it landed, no
library page renders media / unit cards / audio / a carousel with bespoke
per-page markup — each duplicated concept collapses to ONE component:

| Duplicated UI concept (before) | Single shared component (after) | Issue |
|---|---|---|
| shadcn primitive base (dialog/popover/tabs/scroll-area/tooltip/aspect-ratio) | `components/ui/*` + token bridge `app/shadcn-tokens.css` | #087 |
| image/video render (AssetMedia, RecipeDetail demo, UnitViewer, tiles, blueprint, RemixModal thumb) with per-page sizing | `_shared/Media.tsx` (aspect-fit + cinema bars, `fit="cover"` escape hatch, click→lightbox) | #088 |
| unit tile (feed masonry, block-units grid, more-from rail) | `_shared/UnitCard.tsx` + wrappers `UnitGrid` / `UnitRail`; remix payload single-sourced to `_shared/remix.ts` | #089 |
| bare `overflow-x` recommendation row | `_shared/Carousel.tsx` (prev/next + snap + drag + keyboard), consumed by `UnitRail` | #090 |
| browser-default `<audio controls>` | `_shared/AudioPlayer.tsx` (designed, keyboard-accessible) | #091 |
| feed up-front render / re-pack | windowed infinite scroll + incremental masonry packing in `LibraryListing` | #092 |
| (new) tag discovery | `TagCloud` under the format cards, `?tag=` filter | #093 |
| unit-page single MoreFrom rail | per-dimension rails (template/tags/recipes/assets/format), deduped | #094 |
| navigate-not-download asset links | `_shared`/`u/[id]/DownloadAssetLink.tsx` (blob-fetch save) | #095 |
| command-in-label modal-opening CTA | blue copy-on-click `UseInRalphyButton` | #096 |
| divergent data fetch paths | single `source.ts` adapter (verified) | #097 |

Acceptance verified: `bunx next build` green (166 pages), `bunx tsc --noEmit`
clean, no `1px solid` hairline borders anywhere in the library (separation via
bg-tint + shadow + spacing), English-only. `rg '<video|<img|<audio'` over
`app/library` outside `Media.tsx` / `Lightbox.tsx` / `AudioPlayer.tsx` is empty.
