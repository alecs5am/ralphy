# CGI Hardware — Template

> Premium hardware / gadget CGI render in the visual language of Flipper Zero, Teenage Engineering, Nothing Phone, and Apple keynotes. 8-15s, 9:16 (or 16:9). Macro detail, dramatic raking light, signature hero-shot moment. No VO by default — music and sound design carry the spot; one-line brand text at the outro. **Reference-required: real hardware product photos are mandatory. Hard refuse without them.**

## Header

| Spec | Value |
|---|---|
| Total length | 8-15s (10-12s sweet spot) |
| Aspect | 9:16 (TikTok / Reels / Shorts) — or 16:9 (product page hero, YouTube) |
| Clip count | 3-6 (establishing → 3-4 macro beats → hero-pose finale) |
| FPS | 30 |
| Voiceover | **None by default.** Optional 1-line brand-tag at outro only if user explicitly asks. Keynote-narrator timbre, never UGC peer voice. |
| Captions | Brand-mark + product name overlay only — Remotion-rendered, single line, at hero finale. No Whisper. |
| Music | One track — keynote-electronica / cinematic-score bed. Swell peaks at hero-pose frame. |
| Sound design | **Mandatory.** Foley layer (button-click, snap-fit, vibrate, fan-spin, dial-detent, magnet-snap). |
| Reference required? | **YES — real hardware photos. Hard refuse without them.** |

## Why it works

Industrial-design language is the de-facto luxury-tech vocabulary in 2025-26. The aesthetic does three jobs simultaneously:

1. **Premium signal = price anchor.** Macro shots of CNC-machined edges, anodized finishes, mechanical key-feel — these visual cues are what consumers parse as "expensive". The clip frames the price tier before any number is mentioned.
2. **"They really care about quality" implication.** A camera move that lingers on a port chamfer or stitching transition tells the viewer: someone designed every millimeter. That trust bleeds straight into purchase intent.
3. **Apple / TE / Nothing aesthetic = shorthand for taste.** When a clip uses the same compositional grammar as a keynote, the viewer's brain auto-complete fills in "this brand is at that level". Borrowed credibility, instantly.

This template is a **vocabulary pack and master template** for that aesthetic. Use it as scaffolding, not a script. The split from generic `3d-cgi`: this template is hardware-product-specific. The split from `product-360`: more cinematic, less rotation-heavy. The split from `cgi-architecture`: hardware in the hand, not buildings in space.

## Vibe anchors

The five things that, if any one is broken, make the spot feel cheap:

1. **Background restraint.** Deep black, studio grey, brand-color gradient, or a single brutalist surface. Never a busy environment, never a mock kitchen. The product is the entire subject; the background is a stage.
2. **Raking-light drama.** A single hard key from an extreme side angle (70-85°), creating long highlights along chamfered edges and deep shadow on the opposite side. Soft fill at 1/8 intensity. Rim from 30° behind to separate the silhouette from the dark background. **Light is the second protagonist** — without it, premium hardware reads as plastic toy.
3. **Macro is mandatory.** Every spot must contain at least one macro beat where surface texture, port detail, button-feel, or screen pixel-grid is visible. Without macro, the viewer never feels the materiality. Macro is the proof of craftsmanship.
4. **Hero pose at signature moment.** The "settled" framing the viewer can't help photographing. Flipper Zero: three-quarter front with screen on. Nothing Phone: back-glass with glyph illuminated. Watch: face at 35° tilt. Synth: dial array overhead. Identify the hero pose BEFORE prompting; the finale always returns to it, locked center, holding for ~1.5s.
5. **Kinetic-but-controlled camera.** Premium cinema is slow and confident. Maximum 30°/sec orbit, 0.2 m/sec dolly. Linear motion looks robotic, fast motion looks cheap, hand-held wobble destroys the aesthetic. **Ease-in/ease-out always.**

## Variation axes

| Axis | Common choices |
|---|---|
| Hardware category | Phone · Wearable (watch / band / ring) · Camera · Dev-board / single-board computer · Audio device (synth / DAC / headphones / IEM) · Appliance (espresso / kettle / fan) · Power-tool · Dock / charger · Peripheral (keyboard / mouse / mic) |
| Background | Deep-black void · Studio-grey seamless · Brand-color gradient · Brutalist concrete · Marble pedestal · Contextual environment (desk, hand, workbench) |
| Lighting mood | High-contrast noir (single hard key, deep shadows) · Soft studio (3-point neutral) · Clinical bright (cool 6500K, low contrast) · Dramatic spotlight (single beam from above) · Brand-color wash (key tinted to brand hex) |
| Camera move | Slow orbit (30°/sec) · Dolly push-in (0.2 m/sec) · Pull-back reveal · Detail explore (multi-target rack-focus) · Hand pickup reveal · Exploded-view fly-through · Rack-focus only (camera locked) |
| Materiality emphasis | CNC machined aluminum · Anodized (red / blue / black / natural) · Brushed steel · Mirror-polished metal · Glass back · OLED / e-ink display · Soft-touch elastomer · Leather strap · Transparent polycarbonate · Wood inlay |
| Outro | Brand-mark fade-in · Product-name type-on · Glow-on-boot reveal · Silhouette-into-three-quarter |

Pick one option per axis and build the prompt around them. More than three axes shouting per beat reads as confused.

## Narrative arc — three-act hero structure

Total 8-15s. Times below assume 12s spot.

**Act 1 — Establishing render (0-2s).** Product enters in moody light, locked center or slowly approaching from a held distance. The viewer sees silhouette before detail. Lighting is dim, then a key light snaps or fades up, raking across the chamfer and revealing materiality. Sound: low-frequency rumble or single piano note, ending in a soft tactile "thock". This is the hook.

**Act 2 — Detail exploration (2-10s).** 3-4 macro beats, each 1.5-2.5s, connected by rack-focus pulls or smooth match-cuts (never hard cuts). Beat 2.1: surface texture / chamfer detail. Beat 2.2: port / connector / mechanism. Beat 2.3: interactive element (button, dial, screen, switch — show it move once). Beat 2.4 (optional): scale or context (hand, desk, comparative size). Each beat answers a different question: what is it made of? how does it connect? how does it feel? where does it live?

**Act 3 — Hero pose + brand (10-15s).** Camera settles into the hero angle, locked center. Lighting subtly shifts — rim light strengthens, or background warms, or display glows on boot. Brand-mark + product name fade in over 0.8s on a single line (no tagline, no CTA). Music swells, foley accent (boot chime, snap-fit, magnet-snap). Hold for 1.5s. Fade or freeze.

## Required user inputs

This template is **reference-required**. Before any generation:

1. **At least 3 real hardware product photos** at `workspace/projects/<id>/assets/uploaded/`. Five is the sweet spot. Recommended set:
   - Front-on hero shot (the canonical product photo)
   - Three-quarter view (industrial-design standard angle)
   - Port / connector detail (back, edge, or bottom — wherever IO lives)
   - Surface-texture macro (anodizing, brushed grain, glass, leather)
   - Button / dial / switch macro (the tactile element)
   The repo's reference-required gate (AGENTS.md hard rule #3) refuses generation otherwise.
2. **Brand name** — for the outro overlay. Required.
3. **Product name** — for the outro overlay. Required.
4. **Hardware category** — phone / wearable / camera / dev-board / audio / appliance / power-tool / dock / peripheral. Drives default lighting, camera, music.
5. **Lighting mood** — pick one from the variation axes. Default: high-contrast noir.
6. **Camera move sequence** — pick 3-4 moves from the variation axes for the macro beats. Default: orbit → port-detail dolly → button macro → pull-back hero.
7. **(Optional) Brand color hex** — for brand-color-wash lighting or gradient background.

> **Reference-required gate.** AI-improvised hardware designs always look fake. Wrong port count, hallucinated buttons, anodized colors that don't exist on the real product, mis-rendered finishes. Drop a real product reference, or rephrase the brief in generic terms ("a small dev-board with a yellow case" → fine without ref; "a Flipper Zero" → ref required). User can override with explicit "generate without reference, I understand the quality will be worse" — logged as `stage: "no-ref-consent"`.

## When NOT to use

- **Non-tech physical product** (shoes, bags, cosmetics, fashion) → use `product-360` or `ecommerce-ad`. Industrial-design language is wrong vocabulary for soft-goods.
- **Architecture / spatial product** (building reveals, interior fly-throughs, real-estate hero) → use `cgi-architecture`. This template is hand-held-scale.
- **Food / beverage** → use `food-beverage`. Different lighting language, different motion grammar.
- **Software / SaaS / digital-only product** → use `before-after-product` or a screen-recording template. CGI hardware demands a physical object.
- **"Show how it works" functional demo** → CGI hardware shows what it IS and how it FEELS, not what it does. Pair with or replace by a demo template.
- **Real-person UGC** → wrong template family entirely.
- **Soft-launch / concept teaser without finished hardware** → photoreal CGI of a not-yet-existing product reads as vapor. Wait for shippable industrial-design refs.

## Cost ballpark (single 12s spot, 4 clips)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 4-6 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.60-0.90 |
| Video clips | 4 × `kling-v3.0-pro` × 3s @ $0.14/s | ~$1.68 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Sound design | foley layer mixed in Remotion | $0 |
| VO (optional) | 1 ElevenLabs call (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$2.30-2.60 per spot** |

For premium camera-fidelity beats (exploded-view fly-through, dolly-zoom, complex multi-axis orbit), swap kling for veo-3.1 on those specific clips and expect ~3× cost on those clips.

## Read also

- `hooks.md` — 12 hardware-cinema opens, each with setup / lighting cue / camera move. Pick the hook before writing any prompt.
- `prompt-cookbook.md` — master template, hardware vocabulary, lighting recipes, camera grammar, material physics references, music & sound design, common mistakes, four worked examples (Flipper-Zero-style devboard, Nothing-Phone-style transparent-back, TE-OP-1-style synth, Apple-Watch-style wearable).
