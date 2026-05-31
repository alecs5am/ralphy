// landing/lib/library-v2/catalog.ts
//
// THE MIGRATION OUTPUT for Library v2.
//
// This file is the build-time materialization of the Unit/Block graph, produced
// by classifying EVERY existing library entity in the repo into the five-entity
// model (see ./types.ts and ../../docs/developing-ralphy.md). It is hand-authored
// from a one-time classification pass over:
//   - ~64 `templates/<category>/<slug>/template.yaml` (structure + style + recipe
//     + asset blocks; templates are the block source, NOT Units — they have no
//     rendered media of their own).
//   - 4 `guidelines/<slug>/guideline.json` (style blocks; the prompt-library
//     registers).
//   - The real rendered media under `landing/public/showcase/<slug>/` and the
//     non-hidden `clips` in `landing/lib/data.tsx` (the ONLY source of Units —
//     a Unit must have real media on disk).
//   - `docs/assets-catalog.md` (the reusable asset pool: italian-brainrot
//     characters, trend music — real Asset blocks).
//
// The full classification report (counts, dedupe ratios, the per-entity mapping
// table, and the un-classifiable flags) lives in ./MIGRATION.md.
//
// IMPORTANT: this is a DATA file, not a loader. The lookup maps and relation
// functions are built in ./index.ts from these exports. Keep this file
// side-effect-free and fs-free.

import type { Block, Format, Unit } from "./types";

// ── Formats ──────────────────────────────────────────────────────────────────
// Verbatim from the prototype shape spec (lib2/data.js). `podcast-cuts` carries
// a new format hue token in the design; it has zero real Units in this pass (no
// rendered podcast-cut media on disk yet) but stays in the taxonomy so the
// format card renders with count 0.
export const FORMATS: Format[] = [
  {
    id: "video",
    label: "Video",
    glyph: "▶",
    aspect: "9 / 16",
    unit: "clip",
    blurb: "A finished moving-image deliverable — one composed clip.",
  },
  {
    id: "carousel",
    label: "Carousel",
    glyph: "❯",
    aspect: "4 / 5",
    unit: "slides",
    blurb: "A multi-slide swipeable post; each slide is its own still.",
  },
  {
    id: "sticker-pack",
    label: "Sticker pack",
    glyph: "✺",
    aspect: "1 / 1",
    unit: "stickers",
    blurb: "A die-cut set sharing one mascot or visual system — 32+ stills.",
  },
  {
    id: "podcast-cuts",
    label: "Podcast cuts",
    glyph: "♬",
    aspect: "9 / 16",
    unit: "cuts",
    blurb: "A stack of vertical clips cut from one long conversation.",
  },
  {
    id: "fb-creative",
    label: "FB creative",
    glyph: "❤",
    aspect: "1 / 1",
    unit: "creatives",
    blurb: "A Meta-ads test set — silent videos and static cards across angles.",
  },
  {
    id: "motion-design",
    label: "Motion design",
    glyph: "✳",
    aspect: "16 / 9",
    unit: "clip",
    blurb: "Code- and animation-driven motion graphics, not camera footage.",
  },
  {
    id: "poster",
    label: "Poster",
    glyph: "✦",
    aspect: "4 / 5",
    unit: "still",
    blurb: "A single high-impact key-art still — drop, flyer, hype graphic.",
  },
  {
    id: "image",
    label: "Image",
    glyph: "◐",
    aspect: "1 / 1",
    unit: "still",
    blurb: "A single generated still that is the deliverable on its own.",
  },
];

// ── Building blocks ────────────────────────────────────────────────────────
// Each tuple is [id, name, blurb] (and [id, name, sub, blurb] for assets). The
// arrays are already deduped — many real templates collapse onto one structure
// block, many real styles share one register.

// Template blocks = STRUCTURE / skeleton, style-agnostic. Seeded from the
// prototype vocab + new skeletons the real template set demands.
const TEMPLATES: Array<[string, string, string]> = [
  // ── prototype-seeded structures ──
  ["choose-the-door", "Choose the Door", "A fork-in-the-path decision reveal — two options framed left/right, a beat of suspense, then the pick."],
  ["before-after", "Before / After", "The classic transformation cut — establish the sad state, swipe, reveal the glow-up."],
  ["tier-list", "Tier List", "Rank N things into S–F rows; hot takes, screenshot bait."],
  ["versus", "Versus", "Head-to-head split screen — us vs. them, this vs. that, pick a side."],
  ["countdown", "Countdown list", "A ranked listicle that climbs to #1 with a hook on every beat."],
  ["reaction-stack", "Reaction stack", "A grid of reaction faces/states from one character — the meme-kit skeleton."],
  ["testimonial", "Testimonial", "A talking-head or quote-card structure built for trust and proof."],
  ["product-reveal", "Product reveal", "Tease, build, drop — a rhythm engineered around a single hero object."],
  ["pov-walk", "POV walk", "First-person traversal through a space, holding on landmarks."],
  ["explainer", "Explainer", "Step-by-step walkthrough with labelled beats and a payoff."],
  // ── new structures the real template set demands ──
  ["talking-head", "Talking head", "One presenter delivers straight to camera — a hook, a take, a button."],
  ["story-time", "Story time", "A first-person narrated arc — setup, conflict, resolution, punchline."],
  ["grwm", "Get-ready-with-me", "A real-time routine narrated start-to-finish while the presenter prepares."],
  ["unboxing", "Unboxing / reveal", "The package-to-payoff structure — anticipation, open, first reaction."],
  ["interview-duo", "Interview duo", "Two voices in conversation — question / answer rhythm with cutaways."],
  ["music-video", "Music video", "Beat-driven performance / montage cut to a track, not a narrated script."],
  ["asmr-sensory", "ASMR sensory", "Slow, close, trigger-led — no narrative arc, just sustained sensation."],
  ["lifestyle-montage", "Lifestyle montage", "A b-roll mood reel — fast cuts of a place, product, or routine in use."],
  ["fb-creative-pack", "FB creative pack", "A multi-angle static-ad matrix — real-people, graphic, proof, meme, niche sets."],
  ["sticker-set", "Sticker set", "A die-cut reaction set — one mascot rendered across N emotional states."],
  ["carousel-deck", "Carousel deck", "A swipeable multi-slide deck — cover, body slides, payoff."],
  ["motion-card", "Motion card", "A typographic / kinetic announcement card revealed beat-by-beat, code-driven."],
  ["showcase-wall", "Showcase wall", "A tiled proof-wall of prior outputs — hook, wall, featured, stack, CTA."],
  ["pov-narrative", "POV narrative", "An object / character lives a short dramatized arc from its own POV."],
  ["walkthrough-tour", "Walkthrough tour", "A guided spatial tour — a property, a space, a UI, room by room."],
];

// Style blocks = aesthetic register. Seeded from the 4 guidelines + the
// prototype style vocab + the register each real template implies. Deduped hard
// (many photoreal templates share one `photoreal` style).
const STYLES: Array<[string, string, string]> = [
  ["photoreal", "Photoreal", "Clean cinematic realism — shallow depth, motivated light, no stylization."],
  ["photoreal-portrait", "Photoreal portrait", "Anti-AI-slop human realism — real camera + lens + film grain + asymmetry, naturalistic not glossy."],
  ["cinematic", "Cinematic film", "35mm-grade narrative look — halation, lifted blacks, telecine bias, letterbox."],
  ["commercial-bright", "Commercial bright", "High-key pastel commercial light — clean, saturated, advertising gloss."],
  ["cgi-render", "CGI render", "Hyper-real product / hardware render — rim-light pairs, macro, studio-clean."],
  ["3d-cgi", "3D / CGI", "Stylized 3D animation — rigged characters, rendered worlds, not camera footage."],
  ["anime-action", "Anime action", "High-energy 2D anime — speed lines, dynamic poses, saturated key art."],
  ["cel-cartoon", "Cel cartoon", "Saturday-morning cel shading, bold outlines, squash-and-stretch."],
  ["comic-panel", "Comic panel", "Inked comic-book panels — halftone shading, bold outlines, panel gutters."],
  ["pixel-art", "Pixel art", "Crunchy dithered 8-/16-bit pixels with a limited palette."],
  ["analog-horror", "Analog horror", "Degraded VHS, wrong colors, dread between the frames."],
  ["found-footage", "Found footage", "Handheld faux-documentary grain — timestamp, drift, the camera shouldn't be here."],
  ["soviet-propaganda", "Soviet propaganda", "Heroic constructivist register — red, ochre, grain, big diagonal type."],
  ["soviet-nostalgic", "Soviet nostalgic", "Faded late-Soviet home-archive look — VHS warmth, grain, period detail."],
  ["y2k-streetwear", "Y2K streetwear", "Skate-surf Y2K energy — beveled slab wordmarks, vinyl-sticker collage, vivid gradient."],
  ["acid-graphics", "Acid graphics", "Chrome type, blown-out gradients, rave-flyer maximalism."],
  ["swiss-editorial", "Swiss editorial", "Grid-locked, restrained — all about the type and the whitespace."],
  ["italian-brainrot", "Italian brainrot", "Surreal AI animal-object hybrids with nonsensical Italian voice — meme chaos."],
  ["brainrot-split", "Brainrot split-screen", "Top talking layer over a bottom hypnotic-gameplay loop — the brainrot kit."],
  ["fashion-editorial", "Fashion editorial", "Lookbook polish — styled wardrobe, motivated light, model-forward framing."],
  ["kinetic-typography", "Kinetic typography", "Type-as-motion — words animate as the subject, code-exact, brand-led."],
  ["risograph", "Risograph", "Paper-grain riso print — limited spot inks, mis-registered overprint, soft halftone texture."],
  ["club-flyer", "Club flyer", "Late-night rave-flyer energy — high-contrast neon on black, blown gradients, bold party type."],
  ["punk-collage", "Punk collage", "Xerox cut-and-paste zine punk — ransom-note type, torn edges, photocopied grit."],
  ["zine-cutout", "Zine cut-out", "Hand-made paper-cutout zine — scissored shapes, tape, marker scrawl, scrapbook layering."],
];

// Recipe blocks = composable effects / treatments. Only attached where the
// template clearly implies them. Seeded from the prototype vocab; a clean
// talking-head carries zero recipes.
const RECIPES: Array<[string, string, string]> = [
  ["rain-overlay", "Rain overlay", "Layered falling-rain plates with parallax and lens spatter."],
  ["lantern-glow", "Lantern glow", "A warm volumetric point-light that hugs the subject and falls off fast."],
  ["voxel-dither", "Voxel dither", "Ordered-dither shading that keeps gradients chunky and blocky."],
  ["noir-grade", "Noir grade", "Crushed blacks, cool shadows, a single warm key — moody contrast."],
  ["vhs-overlay", "VHS overlay", "Tracking lines, chroma bleed, head-switching noise at the frame edge."],
  ["chroma-split", "Chroma split", "RGB channel offset for a glitchy, off-register edge."],
  ["film-grain", "Film grain", "Organic scanned-film grain layered over the whole frame."],
  ["halftone", "Halftone print", "CMYK dot screen — turns flats into printed comic ink."],
  ["light-leak", "Light leak", "Warm analog bloom washing in from a frame corner."],
  ["crt-scanlines", "CRT scanlines", "Horizontal scanlines + slight barrel curve for a tube-TV read."],
  ["speed-ramp", "Speed ramp", "Punch-in time-remap on the hit — slow, then snap to fast."],
  ["bloom", "Soft bloom", "Gentle highlight bloom for a dreamy, glowing key."],
  ["broadcast-square", "Broadcast square", "1:1 caught-on-TV crop with real-broadcast 16:9 camera grammar."],
  ["burned-captions", "Burned-in captions", "Word-level captions baked into the frame, synced to the VO."],
  ["halation", "Halation", "Film-style highlight bleed and milky lifted blacks."],
  ["typewriter-reveal", "Typewriter reveal", "Clip-path inset + steps() easing — type lands character-by-character."],
];

// Asset blocks = concrete reusable media, by `sub`. Real pool entries from
// docs/assets-catalog.md (italian-brainrot characters — a representative subset
// — and trend music) plus named anchors in the real templates / showcase.
const ASSETS: Array<[string, string, "character" | "location" | "prop" | "music", string]> = [
  // ── characters (real pool: italian-brainrot subset) ──
  ["tralalero-tralala", "Tralalero Tralala", "character", "The seminal Italian-brainrot character — three-legged shark in sneakers."],
  ["bombardiro-crocodilo", "Bombardiro Crocodilo", "character", "Crocodile-bomber-plane hybrid; canonical Italian-brainrot meme."],
  ["ballerina-cappuccina", "Ballerina Cappuccina", "character", "Ballerina with a cappuccino-cup head; Italian-brainrot trend lead."],
  ["chimpanzini-bananini", "Chimpanzini Bananini", "character", "Monkey-banana hybrid; Italian-brainrot AI meme character."],
  ["vpn-mascot", "VPN shield mascot", "character", "A round, friendly shield-creature — the sticker-pack lead."],
  ["doctor-authority", "Doctor authority figure", "character", "A white-coat clinician used as the trust-anchor presenter."],
  // ── locations ──
  ["studio-cyc", "Studio cyclorama", "location", "An infinite seamless sweep with controllable key light."],
  ["tokyo-alley", "Tokyo back-alley", "location", "Neon-soaked rain-slick alley, vending machines glowing."],
  ["soviet-plaza", "Soviet plaza", "location", "A vast concrete square under heroic banners."],
  ["mockumentary-room", "Mockumentary interior", "location", "A drab interview room dressed for found-footage dread."],
  ["product-set", "Product hero set", "location", "A controlled tabletop / pedestal set built around one hero object."],
  // ── props ──
  ["hero-product", "Hero product", "prop", "The single branded object a reveal / ad is engineered around."],
  ["energy-drink", "Energy drink can", "prop", "A cold, sweating hype can used as a stand-in hero object."],
  ["gameplay-loop", "Gameplay loop", "prop", "A hypnotic CS:GO-surf gameplay loop used as the brainrot bottom layer."],
  ["brand-stickers", "Brand sticker set", "prop", "A pool of brand stickers dropped onto the canvas with an overshoot."],
  // ── music ──
  ["trend-soviet-bed", "Soviet trend bed", "music", "The canonical Soviet-nostalgic trend music bed — recognizability is half the format."],
  ["horror-bed", "Horror dread bed", "music", "A degraded horror-TikTok music bed — slowed, reverbed, dread-forward."],
  ["electronic-beat", "Electronic beat", "music", "A 120-140 BPM electronic backbone for motion / kinetic spots."],
  ["lofi-bed", "Lo-fi bed", "music", "A dusty head-nod loop with vinyl crackle for talk / podcast cuts."],
];

function mkTemplates(): Block[] {
  return TEMPLATES.map(([id, name, blurb]) => ({ kind: "template" as const, id, name, blurb, refs: [] }));
}
function mkStyles(): Block[] {
  return STYLES.map(([id, name, blurb]) => ({ kind: "style" as const, id, name, blurb, refs: [] }));
}
function mkRecipes(): Block[] {
  return RECIPES.map(([id, name, blurb]) => ({ kind: "recipe" as const, id, name, blurb, refs: [] }));
}
function mkAssets(): Block[] {
  return ASSETS.map(([id, name, sub, blurb]) => ({ kind: "asset" as const, id, name, sub, blurb, refs: [] }));
}

export const BLOCKS: {
  template: Block[];
  style: Block[];
  recipe: Block[];
  asset: Block[];
} = {
  template: mkTemplates(),
  style: mkStyles(),
  recipe: mkRecipes(),
  asset: mkAssets(),
};

// ── Units ──────────────────────────────────────────────────────────────────
// ONLY real rendered media becomes a Unit. Each entry below is backed by files
// under `landing/public/showcase/<slug>/` or the homepage hero `clips` in
// data.tsx (non-hidden only — the HIDE_SLUGS set in library-index.ts collapses
// hero clips that duplicate a template category; only `nothing-hp1-001`
// survives that filter as a unique homepage clip).
//
// `provenance` = best-match single Template + single Style + applicable Recipes
// + named Assets. Where the Unit came from a known template, that template's
// classification is the factual provenance.

const SHOWCASE = "/showcase";

export const UNITS: Unit[] = [
  // ── animated-fb-ad (motion-design) ──
  {
    id: "animated-fb-ad",
    format: "motion-design",
    title: "Animated FB Showcase Reel",
    blurb:
      "A 1:1 silent motion reel that proves a tool's range — hook, a tiled showcase wall of prior outputs, a featured clip, an integration-logo marquee, and a CTA card. One opacity-gated GSAP timeline.",
    date: "2026-05",
    templateId: "showcase-wall",
    styleId: "kinetic-typography",
    recipeIds: ["typewriter-reveal", "bloom"],
    assetIds: ["brand-stickers"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/animated-fb-ad/ralphy-fb-ads-001-v4.mp4`, kind: "video", aspect: "1 / 1" }],
  },
  // ── brainrot-ai-meme (video) ──
  {
    id: "brainrot-ai-meme",
    format: "video",
    title: "Brainrot AI Meme",
    blurb: "A talking AI-meme layer stacked over a hypnotic gameplay loop — the canonical brainrot split-screen kit.",
    date: "2026-05",
    templateId: "story-time",
    styleId: "brainrot-split",
    recipeIds: ["burned-captions"],
    assetIds: ["gameplay-loop"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/brainrot-ai-meme/final.mp4`, kind: "video", aspect: "9 / 16" }],
  },
  // ── broadcast-caught-on-tv-square (video) ──
  {
    id: "broadcast-caught-on-tv-square",
    format: "video",
    title: "Broadcast Caught-On-TV (Square)",
    blurb: "A 1:1 caught-on-TV moment with real-broadcast camera grammar — sports / news / audience-cam energy.",
    date: "2026-05",
    templateId: "lifestyle-montage",
    styleId: "photoreal",
    recipeIds: ["broadcast-square"],
    assetIds: [],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/broadcast-caught-on-tv-square/scene-01-vid.mp4`, kind: "video", aspect: "1 / 1" }],
  },
  // ── dev-tool-fb-creative-pack (fb-creative, 32 stills) ──
  {
    id: "dev-tool-fb-creative-pack",
    format: "fb-creative",
    title: "Dev-Tool FB Creative Pack",
    blurb:
      "A 32-up static Meta ad matrix for a dev tool — real-people testimonials, typography posters, proof / data-viz, memes, and niche hooks, all on-brand via site-grounding + ref discipline.",
    date: "2026-05",
    templateId: "fb-creative-pack",
    styleId: "photoreal-portrait",
    recipeIds: ["film-grain"],
    assetIds: ["studio-cyc", "doctor-authority"],
    mediaCount: 32,
    media: [
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/01-a1-pain-face.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/02-a2-testimonial.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/03-a3-lifestyle.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/04-a4-pair-prog.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/05-a5-over-shoulder.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/06-a6-asian-founder.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/10-b1-big-number.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/11-b2-versus.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/12-b3-code-as-art.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/18-c1-before-after.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/25-d1-wojak-meme.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/dev-tool-fb-creative-pack/30-e1-rag-hook.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  // ── food-beverage (video) ──
  {
    id: "food-beverage",
    format: "video",
    title: "Ginger Pour",
    blurb: "Appetizing macro product motion — pour, splash, glisten — engineered around a single hero drink.",
    date: "2026-05",
    templateId: "product-reveal",
    styleId: "commercial-bright",
    recipeIds: ["speed-ramp", "bloom"],
    assetIds: ["hero-product", "product-set"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/food-beverage/ginger-recreate-001.mp4`, kind: "video", aspect: "9 / 16" }],
  },
  // ── found-footage-mockumentary (video) ──
  {
    id: "found-footage-mockumentary",
    format: "video",
    title: "Occult Mockumentary",
    blurb: "A faux-documentary occult short — handheld grain, dread between cuts, the camera shouldn't be here.",
    date: "2026-04",
    templateId: "story-time",
    styleId: "found-footage",
    recipeIds: ["vhs-overlay", "film-grain", "noir-grade"],
    assetIds: ["mockumentary-room", "horror-bed"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/found-footage-mockumentary/final.mp4`, kind: "video", aspect: "9 / 16" }],
  },
  // ── live-platform-motion-ad (motion-design) ──
  {
    id: "live-platform-motion-ad",
    format: "motion-design",
    title: "Live Platform Motion Ad",
    blurb: "A kinetic-typography motion ad for a live-streaming platform — code-driven, brand-led, beat-synced.",
    date: "2026-05",
    templateId: "motion-card",
    styleId: "kinetic-typography",
    recipeIds: ["bloom", "chroma-split"],
    assetIds: ["electronic-beat"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/live-platform-motion-ad/twitch-fb-ads-001-v4.mp4`, kind: "video", aspect: "16 / 9" }],
  },
  // ── multi-style-carousel → split into 6 per-aesthetic carousel units ──
  // The single render hid 6 distinct aesthetics on disk (acid / club / punk /
  // riso / swiss / zine, 5 slides each). One Style per Unit, so each look is its
  // own carousel unit with its real 5 slides.
  {
    id: "multi-style-carousel-acid",
    format: "carousel",
    title: "Acid-Graphics Carousel",
    blurb:
      "A five-slide swipeable deck in an acid-graphics register — chrome type, blown-out gradients, rave-flyer maximalism around the mascot.",
    date: "2026-05",
    templateId: "carousel-deck",
    styleId: "acid-graphics",
    recipeIds: ["halftone", "chroma-split"],
    assetIds: ["vpn-mascot"],
    mediaCount: 5,
    media: [
      { src: `${SHOWCASE}/multi-style-carousel/acid-01.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/acid-02.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/acid-03.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/acid-04.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/acid-05.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  {
    id: "multi-style-carousel-club",
    format: "carousel",
    title: "Club-Flyer Carousel",
    blurb:
      "A five-slide swipeable deck in a club-flyer register — neon-on-black, blown gradients, late-night party type around the mascot.",
    date: "2026-05",
    templateId: "carousel-deck",
    styleId: "club-flyer",
    recipeIds: ["chroma-split", "bloom"],
    assetIds: ["vpn-mascot"],
    mediaCount: 5,
    media: [
      { src: `${SHOWCASE}/multi-style-carousel/club-01.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/club-02.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/club-03.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/club-04.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/club-05.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  {
    id: "multi-style-carousel-punk",
    format: "carousel",
    title: "Punk-Collage Carousel",
    blurb:
      "A five-slide swipeable deck in a punk-collage register — xerox cut-and-paste, ransom-note type, torn edges around the mascot.",
    date: "2026-05",
    templateId: "carousel-deck",
    styleId: "punk-collage",
    recipeIds: ["halftone"],
    assetIds: ["vpn-mascot"],
    mediaCount: 5,
    media: [
      { src: `${SHOWCASE}/multi-style-carousel/punk-01.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/punk-02.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/punk-03.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/punk-04.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/punk-05.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  {
    id: "multi-style-carousel-riso",
    format: "carousel",
    title: "Risograph Carousel",
    blurb:
      "A five-slide swipeable deck in a risograph register — paper-grain spot inks, mis-registered overprint, soft halftone around the mascot.",
    date: "2026-05",
    templateId: "carousel-deck",
    styleId: "risograph",
    recipeIds: ["halftone", "film-grain"],
    assetIds: ["vpn-mascot"],
    mediaCount: 5,
    media: [
      { src: `${SHOWCASE}/multi-style-carousel/riso-01.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/riso-02.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/riso-03.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/riso-04.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/riso-05.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  {
    id: "multi-style-carousel-swiss",
    format: "carousel",
    title: "Swiss-Editorial Carousel",
    blurb:
      "A five-slide swipeable deck in a swiss-editorial register — grid-locked, restrained, all about the type and the whitespace around the mascot.",
    date: "2026-05",
    templateId: "carousel-deck",
    styleId: "swiss-editorial",
    recipeIds: [],
    assetIds: ["vpn-mascot"],
    mediaCount: 5,
    media: [
      { src: `${SHOWCASE}/multi-style-carousel/swiss-01.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/swiss-02.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/swiss-03.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/swiss-04.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/swiss-05.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  {
    id: "multi-style-carousel-zine",
    format: "carousel",
    title: "Zine-Cutout Carousel",
    blurb:
      "A five-slide swipeable deck in a zine cut-out register — scissored paper shapes, tape, marker scrawl, scrapbook layering around the mascot.",
    date: "2026-05",
    templateId: "carousel-deck",
    styleId: "zine-cutout",
    recipeIds: ["halftone"],
    assetIds: ["vpn-mascot"],
    mediaCount: 5,
    media: [
      { src: `${SHOWCASE}/multi-style-carousel/zine-01.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/zine-02.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/zine-03.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/zine-04.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/multi-style-carousel/zine-05.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  // ── podcast-explainer-longform (video) ──
  {
    id: "podcast-explainer-longform",
    format: "video",
    title: "Podcast Explainer (long-form, faceless)",
    blurb: "A faceless long-form explainer cut over an audio track — overlay-driven, captioned, chapter-paced.",
    date: "2026-05",
    templateId: "explainer",
    styleId: "swiss-editorial",
    recipeIds: ["burned-captions"],
    assetIds: ["lofi-bed"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/podcast-explainer-longform/final.mp4`, kind: "video", aspect: "16 / 9" }],
  },
  // ── ship-announcement (motion-design) ──
  {
    id: "ship-announcement",
    format: "motion-design",
    title: "Ship Announcement Card",
    blurb:
      "A square typographic ship-week launch card — wordmark, manifesto, a five-row feature table, end-slate URL — revealed by a parallel typewriter primitive over a sparse cube grid.",
    date: "2026-04",
    templateId: "motion-card",
    styleId: "kinetic-typography",
    recipeIds: ["typewriter-reveal"],
    assetIds: [],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/ship-announcement/final.mp4`, kind: "video", aspect: "1 / 1" }],
  },
  // ── silent-square-site-ad (fb-creative) ──
  {
    id: "silent-square-site-ad",
    format: "fb-creative",
    title: "Silent Square Site Ad",
    blurb:
      "A 1:1 silent Meta feed ad built entirely from a brand's own live-site assets — opacity-gated beats, a sticker dump, a color-split bridged by the logo. Zero AI media spend.",
    date: "2026-05",
    templateId: "motion-card",
    styleId: "swiss-editorial",
    recipeIds: ["typewriter-reveal"],
    assetIds: ["brand-stickers"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/silent-square-site-ad/odindoma-fb-21s-v11.mp4`, kind: "video", aspect: "1 / 1" }],
  },
  // ── soviet-nostalgic (video) ──
  {
    id: "soviet-nostalgic",
    format: "video",
    title: "Soviet Nostalgic TikTok Ad",
    blurb: "A faded late-Soviet home-archive ad — VHS warmth, period detail, riding the recognizable Soviet trend bed.",
    date: "2026-04",
    templateId: "lifestyle-montage",
    styleId: "soviet-nostalgic",
    recipeIds: ["vhs-overlay", "film-grain"],
    assetIds: ["trend-soviet-bed"],
    mediaCount: 1,
    media: [{ src: `${SHOWCASE}/soviet-nostalgic/final.mp4`, kind: "video", aspect: "9 / 16" }],
  },
  // ── streetwear-drop-poster (poster, 3 variants) ──
  {
    id: "streetwear-drop-poster",
    format: "poster",
    title: "Streetwear Drop Poster",
    blurb:
      "A poster-as-landing-page for a streetwear drop — massive beveled slab wordmark, chest-up character hero, DIY vinyl-sticker collage, vivid gradient. Three punchline variants.",
    date: "2026-05",
    templateId: "product-reveal",
    styleId: "y2k-streetwear",
    recipeIds: ["halftone"],
    assetIds: ["brand-stickers"],
    mediaCount: 3,
    media: [
      { src: `${SHOWCASE}/streetwear-drop-poster/variant-01-boom.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/streetwear-drop-poster/variant-02-dang.webp`, kind: "image", aspect: "4 / 5" },
      { src: `${SHOWCASE}/streetwear-drop-poster/variant-03-yikes.webp`, kind: "image", aspect: "4 / 5" },
    ],
  },
  // ── vpn-sticker-pack → split into the two looks on disk (clean / outline) ──
  // Disk has 32 clean-* and 32 outline-* stills. One Style per Unit, so each look
  // is its own pack unit; mediaCount stays 32 (the badge), media wires up to ~12
  // real slides so the tile grid is full and the viewer strip has depth.
  {
    id: "vpn-sticker-pack-clean",
    format: "sticker-pack",
    title: "Mascot Sticker Pack — Clean",
    blurb:
      "The VPN shield mascot across 32 reaction states — a flat-fill cel-cartoon die-cut set with bold outlines and soft bloom.",
    date: "2026-05",
    templateId: "sticker-set",
    styleId: "cel-cartoon",
    recipeIds: ["bloom"],
    assetIds: ["vpn-mascot"],
    mediaCount: 32,
    media: [
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-01-hi-beg.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-02-popcorn.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-03-shy.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-04-busy.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-05-fu.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-06-love-mask.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-07-globe.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-08-tableflip.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-09-shrug.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-10-point.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-11-facepalm.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/clean-12-thisisfine.webp`, kind: "image", aspect: "1 / 1" },
    ],
  },
  {
    id: "vpn-sticker-pack-outline",
    format: "sticker-pack",
    title: "Mascot Sticker Pack — Outline",
    blurb:
      "The same VPN shield mascot across 32 reaction states in a paper-grain riso outline variant — spot-ink overprint and soft halftone texture.",
    date: "2026-05",
    templateId: "sticker-set",
    styleId: "risograph",
    recipeIds: ["halftone", "film-grain"],
    assetIds: ["vpn-mascot"],
    mediaCount: 32,
    media: [
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-01-hi-beg.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-02-popcorn.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-03-shy.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-04-busy.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-05-fu.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-06-love-mask.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-07-globe.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-08-tableflip.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-09-shrug.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-10-point.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-11-facepalm.webp`, kind: "image", aspect: "1 / 1" },
      { src: `${SHOWCASE}/vpn-sticker-pack/outline-12-thisisfine.webp`, kind: "image", aspect: "1 / 1" },
    ],
  },
  // NOTE: `vs-comparison-ad` was DROPPED in the v2 review fix-pass — its render
  // (`vs-comparison-ad/final-compressed.mp4`) is a low-res 12s crop of the SAME
  // doors / "Pick a door." footage as `ralphy-vs-higgsfield-001`
  // (choose-the-door), not a real head-to-head ad. Frames + probe confirmed
  // identical content. We keep the doors clip under its correct
  // choose-the-door provenance and drop this duplicate "versus" unit.

  // ── homepage hero clip that survives HIDE_SLUGS (data.tsx → clips) ──
  // Only `nothing-hp1-001` is NOT in the HIDE_SLUGS set, so it is the single
  // unique homepage clip surfaced as its own Unit (the rest collapse onto a
  // template category already represented by a showcase Unit above).
  {
    id: "nothing-hp1-001",
    format: "video",
    title: "Nothing HP1 launch",
    blurb: "A product-launch hero spot for the Nothing HP1 — a clean reveal cut engineered around the hardware.",
    date: "2026-05",
    templateId: "product-reveal",
    styleId: "commercial-bright",
    recipeIds: ["speed-ramp", "bloom"],
    assetIds: ["hero-product"],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/nothing-hp1-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/nothing-hp1-001.jpg",
      },
    ],
    hero: true,
  },

  // ── homepage hero clips formerly hidden by HIDE_SLUGS (data.tsx → clips) ──
  // The v1 HIDE_SLUGS set collapsed these hero clips onto a template category to
  // keep the homepage hero wall lean. In a UNITS feed each produced clip IS a
  // legit Unit (it has real rendered media on disk), so they are surfaced here.
  // `src`/`poster` are the real paths from data.tsx; `aspect` follows the v1
  // `span` (v1/v2 → 9/16, sq → 1/1, h2 → 16/9). Provenance reuses EXISTING
  // blocks only — see the per-template classification table in MIGRATION.md.
  {
    id: "noski-people-001",
    format: "video",
    title: "Socks or People",
    blurb: "A deadpan two-hander talking-head bit — photoreal humans, naturalistic candid light, anti-AI-slop realism.",
    date: "2026-05",
    templateId: "talking-head",
    styleId: "photoreal-portrait",
    recipeIds: [],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/noski-people-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/noski-people-001.jpg",
      },
    ],
  },
  {
    id: "analog-horror-fridge-001",
    format: "video",
    title: "Compliance Bulletin 9-D",
    blurb: "A fake civil-defense PSA — \"your fridge is not your fridge\" — stenciled pictograms, robo-broadcast voice, layered VHS dread.",
    date: "2026-05",
    templateId: "explainer",
    styleId: "analog-horror",
    recipeIds: ["vhs-overlay", "chroma-split", "film-grain"],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/analog-horror-fridge-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/analog-horror-fridge-001.jpg",
      },
    ],
  },
  {
    id: "ralphy-vs-higgsfield-001",
    format: "video",
    title: "Pick a Door — Ralphy vs Higgsfield",
    blurb: "A fork-in-the-path decision reveal in analog-horror register — two doors, a beat of dread, then the pick.",
    date: "2026-05",
    templateId: "choose-the-door",
    styleId: "analog-horror",
    recipeIds: ["vhs-overlay", "chroma-split", "film-grain"],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/ralphy-vs-higgsfield-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/ralphy-vs-higgsfield-001.jpg",
      },
    ],
  },
  {
    id: "flipper-hypermotion-001",
    format: "video",
    title: "Flipper Zero Ad",
    blurb: "A Japanese-hypermotion product reveal — punchy speed ramps, glossy bloom, the hardware as the hero.",
    date: "2026-05",
    templateId: "product-reveal",
    styleId: "cgi-render",
    recipeIds: ["speed-ramp", "bloom"],
    assetIds: ["hero-product", "product-set"],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/flipper-hypermotion-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/flipper-hypermotion-001.jpg",
      },
    ],
  },
  {
    id: "occult-mockumentary-001",
    format: "video",
    title: "Occult Mockumentary",
    blurb: "A first-person found-footage occult story — handheld grain, dread between cuts, the camera shouldn't be here.",
    date: "2026-05",
    templateId: "story-time",
    styleId: "found-footage",
    recipeIds: ["vhs-overlay", "film-grain", "noir-grade"],
    assetIds: ["mockumentary-room", "horror-bed"],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/occult-mockumentary-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/occult-mockumentary-001.jpg",
      },
    ],
  },
  {
    id: "fruit-drama-001",
    format: "video",
    title: "Fruit Drama",
    blurb: "An anthropomorphic-object short — produce lives a tiny dramatized arc from its own POV, glossy 3D bloom.",
    date: "2026-05",
    templateId: "pov-narrative",
    styleId: "3d-cgi",
    recipeIds: ["bloom"],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/fruit-drama-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/fruit-drama-001.jpg",
      },
    ],
  },
  {
    id: "playdate-pixel-001",
    format: "video",
    title: "Playdate Reveal",
    blurb: "A handheld-console product reveal rendered in crunchy pixel-art — limited palette, dithered gradients, retro charm.",
    date: "2026-05",
    templateId: "product-reveal",
    styleId: "pixel-art",
    recipeIds: [],
    assetIds: ["hero-product"],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/playdate-pixel-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/playdate-pixel-001.jpg",
      },
    ],
  },
  {
    id: "kbo-broadcast-001",
    format: "video",
    title: "KBO Caught-On-TV",
    blurb: "A 1:1 caught-on-TV baseball-crowd moment with real-broadcast camera grammar — square because real cameras shoot 16:9.",
    date: "2026-05",
    templateId: "lifestyle-montage",
    styleId: "photoreal",
    recipeIds: ["broadcast-square"],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/kbo-broadcast-001.mp4",
        kind: "video",
        aspect: "1 / 1",
        poster: "/assets/showcase/posters/kbo-broadcast-001.jpg",
      },
    ],
  },
  {
    id: "tokyo-y2k-001",
    format: "video",
    title: "Tokyo Y2K",
    blurb: "A first-person night walk through a neon-soaked Tokyo alley — rain spatter, crushed blacks, dreamy bloom.",
    date: "2026-05",
    templateId: "pov-walk",
    styleId: "cinematic",
    recipeIds: ["rain-overlay", "noir-grade", "bloom"],
    assetIds: ["tokyo-alley"],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/tokyo-y2k-001.mp4",
        kind: "video",
        aspect: "16 / 9",
        poster: "/assets/showcase/posters/tokyo-y2k-001.jpg",
      },
    ],
  },
  {
    id: "skater-spiderverse-001",
    format: "video",
    title: "Skater Duel",
    blurb: "A beat-driven skate showdown cut as inked comic panels — halftone shading, chroma-split edges, bold gutters.",
    date: "2026-05",
    templateId: "music-video",
    styleId: "comic-panel",
    recipeIds: ["chroma-split", "halftone"],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/skater-spiderverse-001.mp4",
        kind: "video",
        aspect: "16 / 9",
        poster: "/assets/showcase/posters/skater-spiderverse-001.jpg",
      },
    ],
  },
  {
    id: "arena-rocker-001",
    format: "video",
    title: "Arena Rocker",
    blurb: "An arena-rock performance montage in saturated cel-cartoon — bold outlines, squash-and-stretch, punchy speed ramps.",
    date: "2026-05",
    templateId: "music-video",
    styleId: "cel-cartoon",
    recipeIds: ["speed-ramp"],
    assetIds: [],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/arena-rocker-001.mp4",
        kind: "video",
        aspect: "16 / 9",
        poster: "/assets/showcase/posters/arena-rocker-001.jpg",
      },
    ],
  },
  {
    id: "glitter-cream-001",
    format: "video",
    title: "Glitter-Cream Review",
    blurb: "A before/after UGC selfie review — establish the dull state, swipe, reveal the high-key commercial glow-up.",
    date: "2026-05",
    templateId: "before-after",
    styleId: "commercial-bright",
    recipeIds: ["speed-ramp"],
    assetIds: ["hero-product"],
    mediaCount: 1,
    media: [
      {
        src: "/assets/showcase/glitter-cream-001.mp4",
        kind: "video",
        aspect: "9 / 16",
        poster: "/assets/showcase/posters/glitter-cream-001.jpg",
      },
    ],
  },
];
