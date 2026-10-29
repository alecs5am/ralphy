# Motion catalog study (#563 checkpoint)

This study informs the transitions and motion-elements catalog that #563 builds under `catalog/`. It breaks down how strong catalogs present items and how their motion is timed, eased, layered, and synced to sound, then turns that into rules for our own HyperFrames (HTML + GSAP) items at 1080x1920. No third-party assets, code, presets, footage, or sound files were copied. Every rule below is a pattern in our own words, with numbers read on the cited pages on 2026-10-30.

## Sources

| Source | URL | What it is | What we took (patterns only) |
|---|---|---|---|
| HyperFrames catalog | https://hyperframes.heygen.com/catalog, its `sitemap.xml`, and about 20 item pages read as `.md` | Open registry: 448 items (210 blocks, 238 components), 31 in Transitions | Card and item-page presentation; the envelope model (fixed IN, elastic HOLD, fixed OUT); declared sync points with named sound cues; per-primitive durations and eases |
| Motion Array | https://motionarray.com/premiere-pro-templates/?categories=transitions plus two item pages (Quick Transitions Pack, Vertical & Square Transitions Pack) | Subscription marketplace for Premiere and After Effects templates | Filter facets, hover-to-play previews, bundling one SFX per transition, preview-reel density |
| Mixkit | https://mixkit.co/free-premiere-pro-templates/transitions/, https://mixkit.co/free-sound-effects/whoosh/, https://mixkit.co/free-sound-effects/transition/ | Free template and SFX library | Transition family vocabulary, tags used as filters, SFX naming and length distribution |
| Jitter templates | https://jitter.video/templates/ | Browser motion tool with 300+ templates | Live in-page previews instead of video files, category chips, UI and social element set |
| Motion craft references | School of Motion "Intro to the Graph Editor" (https://www.schoolofmotion.com/tutorials/intro-to-the-graph-editor-in-after-effects/), LottieFiles easing-editor article (https://lottiefiles.com/blog/working-with-lottie-animations/easing-editor-give-your-animations-the-flow-they-deserve), web.dev "Choosing the right easing" (https://web.dev/articles/choosing-the-right-easing) | Education on curves and timing | Curve family per purpose, duration ranges, impact and settle rules, bounce frame counts |
| Audio mix references | PremiumBeat audio levels (https://www.premiumbeat.com/blog/how-to-set-audio-levels-for-video/), FlexClip transition SFX (https://www.flexclip.com/learn/transition-sound-effects.html) | Editing guides | SFX level range under dialogue, offset of hits after a visual event |

Partially used: Envato Elements transitions (facets and pack names only) and the LottieFiles lower-third category (card metadata only). Motion Array returns HTTP 403 to plain fetches, so it was read in a browser. In-repo rules we stay consistent with: `.agents/skills/hyperframes/references/transitions.md` (energy and mood tables), `.agents/skills/editor/references/green-zone.md` (9:16 safe zone), and `.agents/skills/editor/references/audio-mixing.md` (ducking and loudness).

## Presentation patterns

- **Poster plus hover player (HyperFrames).** Each card shows a static 640x360 poster. On real pointer hover the page mounts a live, muted, audio-locked, non-interactive player of the actual composition over it. Title, a status chip (`published` / `experimental`), and a meta line `family / tag` sit under the media.
- **Category rail with counts (HyperFrames).** Left rail: 11 categories, each with a count and a one-line description (Transitions 31: "cuts between shots: zooms, warps, glitches, light leaks"). The main column shows 3 to 6 cards per category with a "Show All N" expander.
- **Item page as a control surface (HyperFrames).** Chips for duration, resolution, variable count, family, and stability. A live player sits next to a "Tune" panel of typed variables (enum, or number with min, max, step, and unit). Copy buttons cover the agent request, wiring, raw HTML, and the render command. Search is word match over name, title, description, and tags, with optional on-device embedding search.
- **Facet rail plus hover reel (Motion Array).** Facets: Category, Orientation (Horizontal / Vertical / Square), Resolution, app version, Free. Seasonal trend chips sit above the grid. Hover plays a muted 426x240 reel (about 20 s) with an unmute button. Item pages state counts in prose and list resolution.
- **Tags as filters, no motion on the card (Mixkit).** Static thumbnail, title, file type, one-line description, tag links (Zoom, Distort, Blur, Bokeh). No duration on the card. SFX cards show the duration (0:01 to 0:10).
- **Live render in the grid (Jitter).** Cards draw the template on canvas while in view, with no video file. Each card carries a name, a category label, the creator, and a "New" badge.

What we adopt for `catalog/`: a 9:16 card with a poster frame (the peak frame for transitions, the settled frame for elements); hover plays a 2.0 to 2.5 s muted loop (0.5 s of A, the transition, about 1.0 s of B) with an unmute toggle, because our previews carry SFX. Card metadata: name, kind, family, energy, mood, length in frames at 30 fps, and the SFX tag. Facets: kind, family, mood, energy (calm / medium / high), duration bucket, has-SFX. Search uses word match over name, description, and tags, mirroring the HyperFrames approach.

## Timing

All counts are at 30 fps (1 frame = 33.3 ms).

| Energy | Transition length | Typical items | Peak hold |
|---|---|---|---|
| Snappy | 5-9 frames (0.17-0.30 s) | glitch-cut, flash-white, rgb-split, zoom-punch | 0 frames (flash and burn: 1-2) |
| Medium | 10-15 frames (0.33-0.50 s) | whip-pan, slide-push, mask-wipe, spin-swap, split-reveal | 0-3 frames |
| Calm | 18-30 frames (0.6-1.0 s) | blur-dissolve, luma-dip, light-leak, ink-bleed, film-burn | 9-15 frames at peak blur |

These bands match the repo energy table (high 0.15-0.3 s, medium 0.3-0.5 s, calm 0.5-0.8 s). Registry primitives run longer so they read alone in a preview: whip 0.55 s, zoom-through push 0.9 s, iris pass 1.10 s, ink bloom 2.8 s, spring pop 0.6 s (HyperFrames). Marketplace reels show about 1.0-1.2 s per transition including footage (Motion Array: 30 transitions in a 0:30 reel, 18 in 0:21). For short-form we compress registry envelopes by roughly half.

Holds around the transition:

- **Lead (A at rest):** at least 6-8 frames of a readable, still A before motion starts. HyperFrames defaults start the whip at 0.25 s (7.5 frames) and the zoom push at 0.35 s.
- **Tail (B at rest):** at least 8-10 frames of still B before any new element animates. HyperFrames holds are "dead still" by contract, and count-up ends with 0.25 s of stillness.
- **Envelope model:** fixed IN, elastic HOLD, fixed OUT. Retiming a clip only stretches HOLD, and IN and OUT shrink together only when the clip is shorter than both (HyperFrames; never time-scale the timeline).

Where the swap (the hidden cut) lands:

| Family | Swap point | Note |
|---|---|---|
| Velocity (whip, push, spin, zoom-punch, stretch) | Peak velocity: the midpoint of an inOut tween, or the boundary of a power4.in / power4.out pair | Blur and opacity match on both sides of the seam. A cut fraction of 0.4-0.5 gives a fast exit and a readable catch (HyperFrames cut-the-curve) |
| Light (flash, burn, light-leak) | Maximum coverage: overlay opacity at least 0.95 | Swap inside the 1-2 frame hold |
| Distortion (glitch, rgb-split, mosaic, blur) | Maximum distortion: largest offset, block size, or blur | Both sides at equal distortion |
| Reveal (mask, iris, split, shutter, ink, card-flip) | No hidden swap: B sits under the mask from frame 0 | The perceptual cut is at 50% coverage; the sync point is the landing (iris fully open) |

## Easing

| Purpose | Curve | GSAP | Source |
|---|---|---|---|
| Whip, push, zoom-punch, spin | Accelerate out of A, decelerate into B | `power4.in` then `power4.out` (split), or one `power3.inOut` / `expo.inOut` tween on a shared strip | HyperFrames cut-the-curve and whip-pan-cut; repo presets |
| Blur on a mover | Rises with speed, falls with speed | `power3.in` up to the midpoint, `power3.out` down; cap the blur | HyperFrames whip-pan-cut |
| Entrances (UI, text) | Fast start, soft land | `power3.out`; `expo.out` for a burst with a clean settle | HyperFrames count-up and marker-highlight; LottieFiles; web.dev (ease-out, 200-500 ms) |
| Exits | Gather speed and leave | `power2.in`, 0.30-0.45 s | HyperFrames OUT phases; web.dev warns ease-in ends with a jolt, so only exits that leave the frame or are covered |
| Pops, badges, checks | One overshoot then settle | `back.out(1.7)` (range 1.1-2.0); opacity on its own non-overshooting ease | HyperFrames spring-pop and success-check (`back.out(1.8)`, 0.34 s) |
| Playful bounce | Several decaying overshoots | `elastic.out(1, 0.5)`, 24-36 frames only | web.dev (800-1200 ms); rarely fits short-form |
| Notification drop | Physical spring, about 3% overshoot | Custom spring or `back.out(1.2)`; first contact at about 0.31 s, settled by 0.9 s | HyperFrames native-notification-pop |
| Dissolves, light, luma | Symmetric and soft | `sine.inOut`, `power1.inOut` | Repo calm presets; LottieFiles (sine for gentle fades) |
| Glitch, mosaic, stop-motion | Discrete jumps | `steps(n)` or hard `set` calls on a 2-frame grid | HyperFrames zoom-through flash (`steps(1)`, 0.07 s) |
| Stroke draw-on | Even draw, soft ends | `power2.inOut` (underline, arrow); `power2.out` for checks | HyperFrames marker-highlight, success-check |
| Counters | Digits slow before landing | `sine.inOut` on the value | HyperFrames count-up |
| Continuous drivers | Constant rate | `none` (shader progress, noise shake, real-time progress) | HyperFrames shader blocks, camera-shake |
| Impacts | Hard stop on contact, no ease-in to the surface | `power2.in` to contact, then a cut; bounces of 8, 4, 3, 2 frames | School of Motion |

Snappy feel comes from steep curves with long flat tails (School of Motion), not from shorter durations alone.

## Layering

- **Z-order by family.** Velocity transitions put A and B on one strip that moves as a single unit, so seam velocity matches by construction (HyperFrames whip-pan-cut). Reveal transitions put B on top, masked (mask-wipe, iris, ink-bleed). Exit transitions put A on top while it moves away (split-reveal, page-curl). Shutter bars sit above both scenes.
- **Overlay order, top to bottom:** persistent captions and UI, then light (flash, leak, burn in `screen` or additive blend), then texture (grain in `overlay` blend with a static seed), then chroma copies, then scenes. Captions never sit under a transition.
- **Faking motion blur.** Blur one axis only with an SVG Gaussian (`stdDeviation` set to "X 0"), capped and peaking at peak velocity, zero at both ends. HyperFrames caps it at 16 px on a 1920-wide travel. For a 1920-tall vertical travel we cap at 16-24 px. Add 5-10% scale stretch along the travel axis. For spins, trail 2 ghost copies 1-2 frames behind at 0.3 and 0.15 opacity. True sub-frame shutter sampling (HyperFrames motion-blur: a 2-frame window of averaged samples) is reserved for hero text because it multiplies render cost.
- **Seam accents.** A hairline or colour bar rides the moving edge and is visible only while it moves (HyperFrames whip-pan-cut seam, lt-mask-reveal sweep).
- **Two- and three-layer stacks.** Richer transitions combine one move with one or two overlays: zoom-punch = scale + blur ghosts + 0.5-opacity flash at the swap; glitch-cut = slice offsets + RGB split + noise; film-burn = burn gradient + scene brightness + grain. More than three layers rarely reads in 6-9 frames.
- **Determinism.** Seeded random for blobs, particles, and slices (HyperFrames ink-bleed); no `requestAnimationFrame`; static grain during holds so held frames are identical. Keep `filter` on at most one full-frame layer.

## Sound sync

The HyperFrames primitives never play audio. Each one emits a named cue at its declared sync point (`whip-cut`, `impact-hard`, `notification-pop`), and the composition places the sound. We adopt the same split: each catalog item declares a sync frame, an SFX tag from the #563 pack (`whoosh`, `hit`, `riser`, `pop`, `glitch`, `click`), and an offset in frames. Marketplaces bundle one sound per transition (Motion Array: "30 transitions with 30 sound fx"; glitch bundles ship with SFX pre-placed), while Mixkit keeps SFX in a separate library. We keep sound separate in the manifest and mix it into the preview mp4.

| Cue | Placement | Used length |
|---|---|---|
| Whoosh | Onset 2-4 frames before the visual peak so the loudest part lands on the swap frame; the tail decays into B | 0.3-0.8 s (trim; Mixkit "fast" whooshes are about 1 s, the whoosh page median is 3 s) |
| Hit / impact | Exactly on the swap or contact frame; up to +1 frame late is fine, never early | 0.2-0.6 s including tail |
| Riser | Ends on the swap frame, as a hard stop or straight into a hit; starts inside the preceding scene, never across two cuts | 0.5-1.5 s (15-45 frames); Mixkit risers run to 13 s, so trim |
| Pop | First frame where the scale crosses 1.0 on the overshoot: for `back.out(1.7)` that is 37% into the tween (frame 7 of an 18-frame pop, frame 4-5 of 12) | 50-150 ms |
| Glitch | Stutter slices aligned to the visual step grid (every 2 frames) | 0.2-0.4 s |
| Click / tick | On stroke end (checks, underlines), chip landing, or button press | 30-100 ms |
| Notification | At first contact with rest (about frame 9-10) | 0.2-0.4 s |

Why never early: sound ahead of its picture is noticed sooner than sound behind it. ITU-R BT.1359 puts detectability at about 45 ms early versus 125 ms late (1.4 versus 3.7 frames). FlexClip likewise puts transition sounds 1-2 frames after the visual starts. A whoosh is not an exception: its onset leads, but its peak sits on the swap.

Levels: PremiumBeat gives dialogue at -12 to -15 dB and SFX at -10 to -20 dB, with rare spikes to -8 dB. Our rule under VO: transition SFX peak 12-18 dB below the VO peak, element ticks and pops 18-24 dB below, and hits may come up to 6-8 dB below VO only in a VO gap. The music bed stays at 0.10-0.15 volume under VO, and the final mix is normalized to -16 LUFS integrated, -1.5 dBTP (repo audio-mixing). Density: at most one SFX cue per 0.5 s, and caption emphasis gets no sound by default.

## Short-form (9:16) specifics

- **Safe zone.** On 1080x1920, every element lands fully inside X 60-960, Y 210-1480 (TikTok bottom UI is about 440 px; repo green-zone). Full-frame transitions are exempt, but their focal point (iris centre, zoom origin, burn origin) defaults to the subject area at about (540, 760), not the frame centre.
- **Vertical travel.** A push along Y covers 1920 px against 1080 px along X, about 1.8 times the pixel speed at the same duration. Either add 2-3 frames or cap the blur. An upward push mirrors the feed's swipe and reads as "next point"; a horizontal whip reads as a lateral move or an A/B comparison.
- **Native vertical authoring.** Marketplace packs are mostly 1920x1080 (Quick Transitions Pack). Vertical work is a separate facet and separate packs (Motion Array: 9 vertical + 9 square). We author at 1080x1920 and size amplitudes in container units (`cqw` / `cqh`, the HyperFrames convention), so the same item scales to 1:1 and 4:5.
- **Energy and cut frequency.** One primary transition for 60-70% of cuts plus 1-2 accents (repo transitions.md). High-energy promos cut every 1.5-3 s, explainers every 3-5 s, and the first 3 s carry 2-3 visual events. Transitions take at most 10-15% of runtime: 12 cuts of 8 frames in a 30 s video is 3.2 s, about 11%.
- **Captions persist.** The caption layer stays above every transition. A heavy overlay (flash, burn) may wash over captions only at snappy lengths (3-4 frames at peak).
- **Sound-off first.** Many viewers scroll muted, so the visual peak alone must carry the beat.

## Pattern -> catalog mapping

Timing in frames at 30 fps. "Swap" is the hidden cut frame. Sources: HF = HyperFrames catalog, MA = Motion Array, MX = Mixkit, JT = Jitter, SoM = School of Motion.

| Item | Pattern and layers | Timing | Ease | Sync -> SFX | From |
|---|---|---|---|---|---|
| zoom-punch | A scales 1 -> 1.35 with 2 zoom-blur ghosts and brightness 1.3; B lands 1.2 -> 1; 0.5 flash at swap | 8 (4+4) | `power4.in` / `expo.out` | swap -> `whoosh` -3f, optional `hit` | MX Zoom, Zoom Bounce; HF zoom-through |
| whip-pan | A and B on one strip, one frame of travel; X-only blur capped 16 px; edge hairline | 10-12 | `power3.inOut`, or `power4` pair at 0.45 | peak velocity -> `whoosh.fast` -3f | HF whip-pan-cut, cut-the-curve |
| blur-dissolve | A to blur 15 px, scale 1.05, fade; B from blur 15 px, scale 0.95 | 12+12 medium; calm 24-30 with 9-15 hold at 20-30 px | `power2.in` / `power2.out`; calm `sine.inOut` | peak blur -> `whoosh.soft` -2f | HF transitions-blur |
| mask-wipe | B revealed by a moving `clip-path` edge with a 2-4 px accent bar ahead of it | 10-14 | `power3.inOut` | edge at 50% -> `whoosh.fast` | HF lt-mask-reveal, directional-wipe; MX diagonal wipe |
| glitch-cut | Slice offsets, RGB offsets, posterize on a 2-frame step grid | 6 | `steps(3)` | middle step -> `glitch` on grid | HF glitch, chromatic-aberration-wipe; MX Digital Static; MA glitch packs |
| flash-white | White overlay 0 -> 1 in 3 frames, 1-2 frame hold (swap inside), 1 -> 0 in 5 | 9-11 | `power2.in` / `power2.out` | swap -> `hit` | HF flash-through-white, zoom-through flash |
| luma-dip | Grayscale map thresholds over time; dark areas of A go first, B shows through | 18-24 | `sine.inOut` | 50% coverage -> none or `riser` ending there | HF transitions-dissolve; repo calm presets |
| spin-swap | A rotates 0 -> 90 deg and scales 1 -> 1.3 with 2 ghosts; B continues -90 -> 0 | 10-12 | `power4.in` / `power4.out` | peak angular velocity -> `whoosh` -3f | MX Reverse Spin, Spin And Twist |
| slide-push | A and B on one strip, upward by default; blur at most 6 px | 10-14 | `power3.inOut` | midpoint -> `whoosh.soft` | HF transitions-push, page-slide |
| circle-iris | Circle `clip-path` from 0 to the far-corner radius, centred on the subject; ring stroke fades before the corners | 14-18 | `power3.inOut` or `expo.out` | iris fully open -> `whoosh` peaking at open | HF iris-reveal, sdf-iris |
| split-reveal | A splits into 2-3 panels that part with a 2-frame stagger, revealing B beneath | 12-16 | `power4.inOut` | first panel clear -> 2 `whoosh.fast`, one per panel | MX Frame Split; HF gooey-split |
| zoom-out-reveal | A shrinks into its place inside B as a rounded card with shadow (camera pull-back) | 14-20 | `expo.inOut` | settle -> reverse `whoosh` ending at settle | HF pull-back-reveal, parallax-unzoom; MX Outwards Zoom |
| rgb-split | 3 channel copies of A (screen blend) spread to 20-40 px; swap; B collapses back | 6-8 | `power2.in` / `power2.out` | peak offset -> `glitch` short zap | HF chromatic-radial-split, caption-glitch-rgb; MA RGB-split bundle |
| light-leak | Warm gradient blobs (screen blend) sweep across to 0.9 coverage; swap under it; static grain | 18-30 | `sine.inOut` | peak coverage -> `whoosh.soft` at -20 dB | HF light-leak, organic-light-leak-overlay; MX bokeh family |
| shutter-blinds | 8-12 horizontal slats scale to cover with a 1-frame stagger; swap closed; open on B | 12-16 | `power3.inOut` + stagger | closed frame -> `click` rattle per slat group | HF transitions-mechanical, shutter-slam; repo clinical mood |
| stretch-squash | A stretches along travel (scaleY 1.4, scaleX 0.85) and exits; B enters squashed and overshoots to 1 | 10-14 | `power4.in`, then `back.out(1.4)` | B overshoot -> `whoosh` + `pop` | SoM squash and stretch; JT Image Stretch Transition |
| film-burn | Orange-white burn blooms from one edge, scene brightness to 2.0, 2-4 frame full-burn hold, decay | 20-30 | `power2.in` up, `sine.out` down | full burn -> `whoosh.soft` + film flutter | MX Film Burn, Zoom Burn; MA Film Burn Transition; HF ridged-burn |
| block-dissolve (was pixel-mosaic) | Block size steps 1 -> 48-64 px; swap at the largest block; B de-pixelates | 8-12 | `steps(6)` | largest block -> `glitch` blip per step | HF grid-pixelate-wipe, ordered-dither-pass |
| card-flip | A rotates on Y to -90 deg around one edge (perspective 1200-1600 px) with an angle-driven shade; B from 90 to 0 | 12-16 | `power3.in` / `power3.out` | edge-on frame -> `whoosh` (paper swish) | HF transitions-3d, split-tilt-cards; Envato perspective packs |
| ink-bleed | B through a gooey mask (blurred blobs + alpha threshold) growing from seeded points | 18-30 (HF 2.8 s is too long) | `power2.out` | 70% coverage -> `whoosh.soft` swell | HF ink-bleed-reveal, goo; MX liquid swipe |
| lower-third | Accent bar in (4 f), name revealed by a `clip-path` inset with a sweep, role line rises 8 f later; out `power2.in` 10 f; Y 1100-1380 | 18 in, 10 out | `power2.inOut`, `power3.out` | bar start -> `whoosh.soft` at -24 dB | HF lt-mask-reveal and 10 lt-* variants; LottieFiles lower thirds |
| text-pop | Per word: scale 0.9 -> 1 with overshoot, opacity on its own ease, 2-3 frame stagger | 9-12 per word | `back.out(1.7)`, opacity `power2.out` | overshoot crossing -> `pop` (hero words only) | HF spring-pop, caption-emoji-pop |
| highlight-sweep | Marker band grows `scaleX` from the left behind text (multiply blend, -2 deg skew) | 8-12 | `power2.inOut` | band complete -> none or soft `click` | HF marker-highlight, caption-highlight |
| arrow-callout | Stroke-dash draw of the shaft, then the head pops; still on hold | 10-14 + 4-6 | `power2.inOut`, head `back.out(2)` | head pop -> `pop` | HF hw-arrow, yt-circle-pointer, vox-annotate |
| counter-roll | Value counts with tabular numerals, arrival rise, 1.07 scale pulse on landing | 20-40 | value `sine.inOut`, pulse `power3.out` | landing -> `hit` or ding; ticks no faster than every 3 f at -24 dB | HF count-up, number-wheel; JT Countdown |
| progress-bar | `scaleX` fill from the left with a small pulse at the end | 15-30 | `power2.out`; `none` when tied to real time | end -> `click` | HF mk-progress-stat, conic-progress-ring |
| emoji-burst | 6-12 seeded emoji: scale in, radial travel, gravity on Y, fade over the last 6 frames | 20-30 | `back.out` in, travel `power2.out`, fall `power2.in` | spawn frame -> `pop` cluster | HF confetti, caption-particle-burst |
| subtitle-emphasis | Active keyword colour swap plus scale 1 -> 1.12 -> 1, keyed to word `startMs` | 6-8 | `power3.out` up, `power2.inOut` back | word start -> none by default | HF caption-pill-karaoke, caption-kinetic-slam; repo invariant 16 |
| cta-pulse | Pops in, then a 1.06 pulse every 30-45 frames and one gloss sweep | 12 in, 12-15 sweep | `back.out(1.6)`, pulse `sine.inOut` | press -> `click` | HF cta-lockup, press-ripple, gloss-sweep; JT View Cart Button |
| tag-chips | Chips rise 20 px from scale 0.9 one by one; earlier chips shift up | 3-4 f stagger, 9 each | `back.out(1.4)` | each landing -> `click` at -24 dB | HF state-chip-rail, spring-stack-shuffle |
| checklist-tick | Box pops (scale 0.72, -18 deg, 7 px blur to rest), check stroke draws 4 f later; rows 8-12 f apart | 10 box + 13 stroke | `back.out(1.8)`, stroke `power2.out` | stroke end -> `click` | HF success-check, marker-checklist-card |
| underline-draw | Stroke-dash or `scaleX` draw; hand-drawn variant redraws on `steps` every 2-3 f | 8-12 | `power2.inOut` | none | HF hw-underline, outline-draw |
| quote-card | Card rises 40 px, quote mark pops, lines slide in 4 f apart, attribution last; still hold | 12-15 card + lines | `power3.out`, mark `back.out(1.7)` | card land -> `whoosh.soft` | HF testimonial-card, line-by-line-slide; JT testimonial stack |
| price-strike | Strike line draws across the old price, which dims to 50% and drops 4 px; new price pops | 6-8 strike + 10 pop | `power2.inOut`, `back.out(1.8)` | new price -> `hit` | HF strikethrough-replace; repo fb-creatives price stack |
| notification-toast | Generic toast drops from above (top of frame at Y 220 or lower), soft spring overshoot, backdrop blur; still hold; exit 13 f | 27 (contact at 9-10) | spring or `back.out(1.2)` | first contact -> `click` ping | HF native-notification-pop, notification-stack |

## Implementation deltas (checkpoint)

Where the shipped fragment departs from the pattern above, because of a CSS or HyperFrames limit or for robustness:

- **luma-dip** approximates a luma key with a brightness fall plus a contrast rise (shadows crush first, highlights last). CSS has no per-pixel luminance threshold on DOM content.
- **block-dissolve** replaces pixel-mosaic: large two-color blocks cover and clear in seeded orders. CSS cannot pixelate live DOM; a real mosaic needs a canvas or shader pass.
- **split-reveal** opens the incoming scene from a center seam with two accent edges instead of splitting the outgoing scene into panels, which would need DOM clones of the scene.
- **stretch-squash** is the CRT off/on variant (collapse to a bright line, stretch back with `back.out`), the most legible squash at 9:16.
- **rgb-split** separates channels with an SVG `feColorMatrix` and `feOffset` filter on the scenes, not with three blended copies.
- **whip-pan** uses an SVG horizontal-only `feGaussianBlur`; CSS `blur()` is isotropic.
- **ink-bleed** grows four feathered radial masks driven by CSS variables instead of a gooey alpha-threshold filter.
- Envelope OUT phases (element exits) are left to the host composition: HyperFrames scenes forbid exit tweens before a transition.

## What we deliberately did not copy

- No HTML, CSS, JavaScript, GLSL, or shader-transition code from the HyperFrames registry, even though it is open source. Our items are written from these rules.
- No footage, `.mogrt` files, After Effects projects, Lottie JSON, presets, or preview reels from Motion Array, Envato, Mixkit, Jitter, or LottieFiles.
- No sound files from any marketplace. Previews use the SFX pack harvested from our own past projects (#563 step 2).
- No item names, brand looks, or OS-faithful chrome (HyperFrames' iOS and macOS notification, liquid-glass surfaces). Our toast and UI elements are generic and token-styled.
- No fitted constants from reference exports (the HyperFrames shutter model and slam rhythm). Our numbers get tuned against our own renders.
