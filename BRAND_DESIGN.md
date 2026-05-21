# BRAND_DESIGN.md — Ralphy visual system

This document captures the brand-level design intent for everything Ralphy ships visually: the landing (`landing/`), the docs (`docs-mintlify/`), the blog (`landing/app/blog/`), the skills page, social cards, and any future surface. It is design **direction**, not a list of pixel values — the actual tokens live in CSS (`landing/app/globals.css`, `docs-mintlify/style.css`).

## Style label

If we needed a name for this style in a design conversation, the closest fit is **editorial modernism with binary geometry** — sometimes also called **soft brutalism**, **post-Swiss**, or **typographic minimalism**. The lineage runs:

- **Swiss / International Typographic Style** (Müller-Brockmann, 1950s) — grid, hierarchy, sans-serif as a first-class citizen.
- **Bauhaus geometry** — sharp rectangles and full circles as the only valid shapes; no soft in-between curves.
- **Flat 2.0** (post-2014 design) — flatness, no skeuomorphism, no decorative depth.
- **Editorial digital design** — magazine-grade typography applied to product surfaces (think Stripe Press, Vercel, Linear, doka.guide, Stripe Atlas onboarding, Apple HIG-era marketing).

It is **not** maximalist brutalism (no raw HTML defaults, no clashing colors, no chaotic layout). It is the calmer cousin: brutalist refusal of decoration, paired with editorial polish.

If you read a section of a landing and your gut response is "this feels engineered, not designed", you are close. The aesthetic should read like Helvetica posters and academic journals, not like a SaaS landing.

## Principles (the hard rules)

These are inviolable. New code that breaks them is a defect.

### 1. Big type. Always.

Typography carries the design. Sizes default **up**, not down. The hero h1 is large enough to feel uncomfortable on first read — that is intentional. Body copy is set at the upper end of legible (~24px on desktop) so the prose feels read-aloud, not skimmed. Sub-headings step down in clear, recognisable jumps (~3:2 or wider), never crowded.

When in doubt, **make the type bigger and the surrounding chrome smaller**.

### 2. Typography over decoration

A heading is not "a heading + an underline + a colored bar". It is just a heading, with size and weight doing the work. Decorative dividers, ornaments, gradients-as-borders, and chrome strokes are forbidden.

Hierarchy comes from:

- Size delta (jumps, not gradients).
- Weight delta (700 vs 500 vs 400, rarely in between).
- Color delta (foreground vs muted, never colored-for-decoration's-sake).
- Space delta (generous margins around important elements).

Hierarchy does **not** come from boxes, borders, shadows, gradients, or backgrounds-as-emphasis.

### 3. Geometry: binary radii

Every shape is one of two things:

- **Sharp** — `border-radius: 0`, or close to it (`4–6px` for small chips where a true `0` looks harsh).
- **Fully round** — pills (`border-radius: 999px`) or circles (icons, dots, traffic lights).

There is no `border-radius: 8px` decision. There is no `12px`. The middle ground — softly rounded squares — is the design language of consumer apps and SaaS marketing. It is not us.

Card and container radii are the one exception: they sit at **14–22px**, large enough to read as a *bento plate* rather than a softly-cornered tile. This is consistent across the project (`14px` for terminal frames, `16–20px` for content cards, `22px` for hero panels).

### 4. No shadows

`box-shadow` is reserved for two cases:

- **Hairline elevation** on a single specific element to denote that a pill or button is pressable (`0 1px 1px rgb(0 0 0 / 0.35)` — barely visible).
- **Inset highlights** to render a glassy edge on an active pill (`0 0 0 1px rgb(255 255 255 / 0.18) inset`).

That is it. No drop shadows on cards. No glow on hover. No layered shadows for depth. Depth comes from background-step contrast.

### 5. No visible borders

This is a hard rule with its own enforcement memory (see [`feedback-no-visible-borders`](~/.claude/projects/-Users-maximovchinnikov-github-ugc-cli/memory/feedback_no_visible_borders.md)).

`border: 1px solid …` on UI elements (cards, buttons, badges, inputs, navbar items, pills) is forbidden. Separation between elements comes from:

- **Background-step contrast** — the bento layering described below.
- **Spacing** — whitespace separates blocks more clearly than a stroke ever does.
- **Type-only hierarchy** — a heading divides sections, an eyebrow tags them.

The one exception: hairline `border-top` between major rows in dense data tables, where pure spacing isn't enough. Even then, prefer `box-shadow: inset 0 1px 0 var(--line)` over `border-top` so it doesn't shift layout.

### 6. Flat color, clear palette

We do not gradient. We do not blend. Colors are picked from a small fixed palette and used **literally**.

The system has three layers of color:

- **Background scale** — 5 steps from page bg to deepest plate. Used for bento-style layering: a card sits one step lighter than its container, a chip sits one step lighter than the card. This is the *only* mechanism for visual depth.
- **Ink scale** — 5 steps from primary text to deep-muted. Heading vs body vs label vs caption is encoded purely in these.
- **Accent (single)** — one brand color per surface. The landing uses **`#FFA630`** (Ralphy orange). The original CSS token (`--vio`) is a dusty rose; the landing-level layout override pins it to orange. Sub-pages inherit.

Brand glyphs (TikTok, YouTube, Meta) are the *only* place full-color logos appear. Everywhere else, color is restricted to the three-layer system.

### 7. Geometry over decoration

When you need to add information density visually, use **geometry**, not ornaments:

- A circle next to a label = state indicator. (Done / In-progress / Planned).
- A square plate with a number = step in a sequence.
- A short colored bar = progress.
- A pill = a category tag.

These geometric primitives are reusable. A drop-shadow or a beveled border is not.

## Tokens (canonical values)

The actual values live in CSS — these are summarised here so design conversations can reference them without grepping.

### Color

```
Backgrounds        Ink                  Accent (landing)
--bg     #0A0A0B   --ink    #F5F5F4    --vio (override)   #FFA630
--bg-1   #131316   --ink-2  #DDDDDA
--bg-2   #1A1A1D   --ink-3  #B5B5B2    Accent (base token, used in templates)
--bg-3   #212125   --mute   #8E8E8B    --vio   #E87BA1  (dusty rose)
--bg-4   #28282C   --mute-2 #5A5A5E    --vio-2 #F2A0BD
                                        --vio-3 #C75C82
```

The orange `--vio` override at `<html style={{ "--vio": "#FFA630" }}>` (see `landing/app/layout.tsx`) is the landing's brand color. Don't fight it — when a sub-page wants to drift, override the variable explicitly at the page level.

### Type

```
--font-display   AWS Diatype Mono     (uppercase, hero/h1/h2 — wide caps)
--font-sans      AWS Diatype          (body copy, nav, UI)
--font-mono      Fragment Mono        (code, kbd, eyebrows, metadata)
--font-pixel     VT323                (mascot/branded easter eggs only)
```

Scale (desktop, post doka.guide calibration):

| Element     | Size                          | Line-height | Family    |
|-------------|-------------------------------|-------------|-----------|
| h1 / hero   | `clamp(40px, 6.4vw, 80px)`    | 1.04        | display   |
| h1 / article| `clamp(40px, 4.6vw, 56px)`    | 1.06        | display   |
| h2          | `clamp(28px, 4.5vw, 56px)`    | 1.0         | display   |
| h3          | `clamp(24px, 2.5vw, 32px)`    | 1.18        | display   |
| body / blog | `clamp(18px, 1.6vw, 24px)`    | 1.5         | sans      |
| body / UI   | 14–16px                       | 1.55        | sans      |
| eyebrow     | 11.5–13px                     | —           | mono UPPER|
| code / chip | 12–14px                       | 1.55        | mono      |

The fact that h1 and body are within 2× of each other on a small screen, but ~3× apart on desktop, is intentional. The screen *is* the layout grid.

### Radii

```
0px        sharp edge (eyebrows, dividers, tiny chips where round looks toy-ish)
999px      pill / circle (nav links, chips, dots, traffic lights, badges)
14px       small card frame (terminal blocks, mini cards)
16–20px    standard card / panel
22–28px    hero panel, big CTA block
```

Never anything else.

### Spacing & density

We follow doka.guide's measure as our density anchor: prose column ~1020px, comfortable inter-paragraph (~28px at body 24px), generous component padding (≥20px on cards), section-to-section breathing room (≥80px).

If two elements feel cramped, the fix is **always** spacing first, never a border or a shadow.

## Bento layering

Every visual depth cue in the system comes from one mechanism: nest a lighter plate inside a darker one.

```
page (bg)        →  --bg
section          →  --bg                       (transparent on bg)
panel / card     →  --bg-1
chip / input     →  --bg-2 or --bg-3
inset (terminal) →  #050506 (one step darker than bg, intentional)
```

Hover states shift by one step (`bg-1 → bg-2`). Active/selected states shift by one step with optionally an inset glassy highlight. **Never** add a border on hover.

## Examples in the wild

Same principles, different brand colors:

- **Vercel** — sharp/round geometry, no shadows, no borders, big type, single accent.
- **Linear** — same, with violet accent and even tighter typography.
- **Stripe (newer marketing)** — large editorial type, restrained color.
- **doka.guide** — best reference for the **text** side: prose width, body 24px, h2 ~40px, generous margins.
- **Stripe Press** — same as doka but with serif body; we use sans, but the typographic weight is the model.

What we are **not**:

- Notion-style soft rounded cards (`8–12px` radii everywhere) — too consumer-app.
- shadcn/ui defaults (subtle borders + soft shadows) — exactly what we said no to.
- Glassmorphism, neumorphism, claymorphism — all banned by §4 and §5.
- Gradient-everything Linear-clones — we use one flat brand color, not a 7-stop gradient.

## Decision checklist

Before adding anything visual to the project, ask:

1. **Could I remove this and the design would still work?** If yes, remove.
2. **Is this a border, shadow, or gradient?** If yes, redesign it without.
3. **Is this radius `0`, `999px`, or `14–22px`?** If anything else, redesign it.
4. **Did I make the type smaller to fit more in?** If yes, make less fit instead.
5. **Did I add a new color?** If yes, justify it against the 3-layer palette.
6. **Is the hover state a new border?** If yes, make it a bg-step instead.

If all six pass, ship.

## Living document

This file is the source of truth for visual decisions. When a future change adds a new visual primitive (a card variant, a chart style, a hero treatment), update this file before the CSS. The memory at `feedback_no_visible_borders.md` enforces one of the rules at agent level; this file is the broader spec.
