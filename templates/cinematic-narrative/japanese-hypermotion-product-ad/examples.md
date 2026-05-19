# Worked examples — Japanese Hyper-Motion Product Ad

Two complete variant fills of the template for products other than Flipper Zero. The source-project Flipper Zero version is referenced in the cookbook directly; these show how the template generalizes.

---

## Example 1 — Panic Playdate (handheld console, yellow body + crank)

The Playdate is a small canary-yellow handheld console with a black 1-bit display and a side-mounted hand crank. Indie-game vibe, Lo-fi aesthetic, but the template carries it just fine — swap the chibi cast for "indie-game mascots" and the slogan for an indie-rallying katakana phrase.

### Slot fills

| Slot | Value |
|---|---|
| `{{brand_name}}` | Panic Inc. |
| `{{product_name}}` | Playdate |
| `{{product_dna_paragraph}}` | "CANARY-YELLOW plastic body, square portrait orientation ~75mm × 75mm × 9mm. BLACK 2.7-inch monochrome reflective 1-bit display centered front (no backlight — high-contrast pure-black-on-pure-white). Two black A/B buttons in lower-right. Black D-pad in lower-left. Bright POLISHED-METAL hand crank protruding from the RIGHT EDGE (signature feature). Tiny stamped 'Playdate' wordmark in black on the lower bezel." |
| `{{brand_kana_logo}}` | プレイデイト (PUREIDEITO) |
| `{{japanese_slogan}}` | アソボウ・モット (let's play more) |
| `{{music_style_keywords}}` | "japanese hyperpop + chiptune crossover, 135 BPM, drum-fill stings on every downbeat, 8-bit lead synth, kawaii vibes, 15 seconds instrumental" |
| `{{hero_archetype}}` | "Japanese gen-z indie-game girl, 19yo, mint-green bowl-cut hair, oversized white tee with retro game art, baggy yellow cargo shorts, vintage white headphones around neck, gleeful focused expression" |
| `{{use_case_location}}` | "Tokyo arcade cafe with retro CRTs in BG, neon-yellow + cyan ambient light" |
| `{{target_audience}}` | "EN + JP indie-game crowd, ItchIO+TikTok crossover, retro-gaming meme followers" |

### Chibi cast redesign for Playdate

1. Yellow-pigtailed pixel-art girl with crank-shaped hair-clip
2. Cat-eared chibi holding a tiny CRT TV (signature Playdate vibe)
3. Goggles-boy with a controller backpack
4. Crank-mascot — the hand-crank itself anthropomorphized with arms/legs (analog to Flipper's dolphin mascot)

### Scene-01 first-frame prompt (variant)

```
Hyper-energetic Japanese hyperpop product-ad aesthetic. Saturated kawaii palette —
canary-yellow base + hot-pink + cyan accents. Glossy 3D scene with depth: tiled
yellow-and-cyan checkerboard floor + tiled back wall, atmospheric pink haze, hot-pink
rim light + cyan accent + warm sunny key. Premium hyper-real CGI render with anime-product
crossover overlays, 8K detail, vertical 9:16 portrait composition.

Subject: The Playdate device — CANARY-YELLOW plastic body, square portrait orientation
~75mm × 75mm × 9mm. BLACK 2.7-inch monochrome reflective 1-bit display centered front
(no backlight — high-contrast pure-black-on-pure-white). Two black A/B buttons in
lower-right. Black D-pad in lower-left. Bright POLISHED-METAL hand crank protruding from
the RIGHT EDGE. Tiny stamped 'Playdate' wordmark in black on the lower bezel.

Pose: the device flying in from the RIGHT EDGE of the frame at a 30-degree forward tilt,
captured mid-motion with a hot-pink motion-blur trail streaking diagonally behind it from
screen-right toward the device. The METAL CRANK catches a sharp glint as it whips through
the air. Device is positioned in the right third of the frame, about to slam toward the
center. Background: yellow-and-cyan tile-grid checkered floor lower third, vertical pink
tile wall behind, the moment just before a yellow sunburst flash explodes. A few tiny
anime starburst particles trailing the device. Vertical 9:16 composition.
```

### Scene-05 exploded-view depth

Playdate is simpler internally than Flipper — use **N=5** layers instead of N=10:

1. Yellow top case with display window
2. Reflective 1-bit display module
3. Single-board PCB with STM32 MCU + battery slot
4. Slim lithium battery
5. Yellow bottom case + crank assembly (kept as one piece since the crank is the visual signature)

### Outro logo slam (scene-06-last)

The katakana logo + slogan rendered in the same yellow-and-cyan palette:

```
ABOVE the device, a LARGE BOLD katakana logo 「プレイデイト」 in YELLOW color with
hot-pink shadow-outline anime-style block typography, fully readable. BELOW the device,
a smaller katakana slogan 「アソボウ・モット」 (let's play more) in cyan color with white
outline. The hand-crank on the device sparkles with a final anime-glint.
```

### Cost estimate

Same as Flipper baseline: ~$7-8 disciplined, ~$10 realistic.

---

## Example 2 — Nothing Ear (a) earbuds (translucent case, dot-matrix UI)

The Nothing Ear (a) is a translucent-plastic earbud case with a visible internal mechanism (springs, screws, dot-matrix LED on the case body). This template carries it surprisingly well — the chibi cast becomes "music-genre mascots" and the slogan becomes a sound-system call.

### Slot fills

| Slot | Value |
|---|---|
| `{{brand_name}}` | Nothing Technology |
| `{{product_name}}` | Nothing Ear (a) |
| `{{product_dna_paragraph}}` | "TRANSLUCENT-CLEAR plastic earbud charging case, square-ish ~50mm × 50mm × 22mm, with visible internal mechanism (springs, screws, magnets). Two TRANSLUCENT earbuds visible inside through the top transparent shell. Signature DOT-MATRIX LED grid on the front face showing a single white-LED bouncing dot animation. Embossed 'Ear (a)' wordmark in white on lower face. USB-C port on bottom edge." |
| `{{brand_kana_logo}}` | ナッシング・イヤー (NASSHINGU IYAA) |
| `{{japanese_slogan}}` | キケコウ・スベテヲ (hear everything) |
| `{{music_style_keywords}}` | "japanese hyperpop arcade instrumental + 808 trap-snare crossover, 140 BPM, glitchy synth stabs, drum-fill stings on every downbeat, neon-pink urban tokyo aesthetic, 15 seconds instrumental" |
| `{{hero_archetype}}` | (omit — go full-product, no human use-case in scene-03) |
| `{{use_case_location}}` | "Floating mid-air over the tile-grid stage, no real-world use-case scene — scene-03 becomes a 360° product-orbit instead of a human-orbit" |
| `{{target_audience}}` | "Gen-z music-tech crowd, audio-meme channels, JP/EN" |

### Scene-03 swapped: 360° product orbit (no human)

When skipping the human use-case scene, scene-03 becomes a product-only beat:

```
Cinematic 3D hyperpop product-orbit scene. The Nothing Ear (a) case floats at the center
of frame, slowly rotating in place. Camera does a smooth dynamic 360-degree orbit around
the case over 2 seconds, starting in front, sweeping to the right side, behind, left side,
back to front. As the camera reaches each side, the DOT-MATRIX LED animation cycles through
patterns (bounce dot → equalizer bars → pulse → sound-wave ripple). Translucent shell catches
neon-pink and cyan light reflections. Background: pink-and-cyan tile-grid floor + tile wall.
Hyper-real CGI product render, hyperpop saturation. Vertical 9:16.
```

### Chibi cast redesign for Nothing Ear

1. Pink-pigtailed girl with oversized headphones around neck
2. Cat-eared chibi holding a tiny boombox
3. Goggles-boy with a DJ controller
4. Sound-wave-mascot — anthropomorphized sound-wave ripple (analog to Flipper's dolphin mascot)

### Scene-05 exploded-view depth (N=6 — earbud case is mechanically rich)

1. Top translucent shell
2. Left earbud (single piece, magnetic)
3. Right earbud (single piece, magnetic)
4. Charging contacts + spring-loaded hinge assembly
5. Internal PCB with dot-matrix LED + USB-C controller
6. Bottom translucent shell + USB-C port

### What changes vs Flipper

- **Scene-03 is product-only** (no human use-case). The 180° human orbit becomes a 360° product orbit; the kling-pro single-frame call goes away — replaced by another seedance-2.0 call.
- **Music skews more electronic / less orchestral** because the product's identity is sound-first. Music variant B (sakura-trap) is the obvious default.
- **The macro-insert scenes** (03b, 05b) lean into the translucent-shell internal-spring visuals — these are the equivalent of Flipper's "coin-magnet" and "GPIO-glint" beats, but with springs/magnets sparkling instead of pins.
- **Cost ballpark drops slightly** since we skip the photoreal-human banana stills and the kling single-frame call: ~$6-7 disciplined.

---

## When to pick which variant pattern

- **Flipper / Playdate pattern** (with human use-case in scene-03) — when product has a real-world use-case story (hacking, gaming, scanning) and an aspirational hero archetype reads natural.
- **Nothing Ear pattern** (full-product, no human, 360° orbit in scene-03) — when product is intimate / wearable / its value is invisible (audio, biometrics, comfort). Putting a human in the scene would diffuse the product's design language.

## Pattern that does NOT work in this template

- **Multi-product / lineup ads** (e.g. "the whole Nothing family"). The template's identity-lock works on ONE product, repeated verbatim across all 14 stills. Trying to feature 3 SKUs simultaneously breaks the lock and the format reads as generic CGI.
- **Service / software products** (apps, SaaS, subscriptions) — no physical product to orbit, no exploded view to reveal, no internals to glint. Use a different template (entertainment-viral or b2b-saas categories).
- **Apparel / fashion** — the tile-grid stage looks awkward holding a t-shirt or shoe; the exploded-view scene doesn't carry. Different template territory.
