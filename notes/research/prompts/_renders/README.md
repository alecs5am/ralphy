# Prompt-render gallery — for grading

Test renders for every image prompt under [`notes/research/prompts/image/`](../image/). One **custom** test prompt was authored per source YAML (technique preserved, subject swapped) and pushed through `ralphy generate image` so you can grade the patterns side-by-side.

## How to grade

1. Open the PNG.
2. Open the sibling `.prompt.md` (custom prompt + grading checkboxes).
3. Open the source YAML to compare the technique that was being tested.
4. Mark `Quality` + `Pattern transferable` + free-form notes in the sidecar `.prompt.md`.
5. Promote the keepers into `docs/prompts/image/` or a Ralphy template.

## Model mapping

| Source folder | Target model used | Why |
|---|---|---|
| `image/nano-banana-pro/` (24) | `google/gemini-3-pro-image-preview` | Same model (Nano Banana Pro lineage on OpenRouter). |
| `image/gpt-image/` (10) | `openai/gpt-5.4-image-2` | Closest OR equivalent of gpt-image-1.5 — best label typography. Serialised (provider concurrency cap = 1). |
| `image/recraft/` (19) | `google/gemini-3-pro-image-preview` | Recraft not on OR; routed via default image model so the structural prompt language can be evaluated. Style enums (`realistic_image` / `vector_illustration` / `logo_raster` / `icon`) don't transfer; treat results as a check of the prompt *body*, not the substyle gating. |
| `image/grok-imagine/` (4) | `google/gemini-3-pro-image-preview` | xAI Aurora not on OR; same rationale as recraft. |

All renders use `--no-ref-consent "research-prompt-grading-batch"` since this is a synthetic grading batch with no real-entity gate to enforce.

## Custom prompts (NOT verbatim)

Each test prompt is a **custom variant** of the source — same technique, swapped subject. The original verbatim prompts stay in the source YAMLs; the grading question is whether the **technique** carries.

| File | Model | Custom prompt (first 120 chars) |
|---|---|---|
| nano-banana-pro/01-elderly-ceramicist-portrait | google/gemini-3-pro-image-preview | A photo of a close-up portrait of an elderly Mexican bookbinder with deep, sun-etched wrinkles and a quiet, focused smil… |
| nano-banana-pro/02-kawaii-red-panda-sticker | google/gemini-3-pro-image-preview | A kawaii-style sticker of a sleepy axolotl wearing a tiny chef's hat. It's holding a small wooden spoon and smiling. The… |
| nano-banana-pro/03-daily-grind-coffee-logo | google/gemini-3-pro-image-preview | Create a modern, minimalist logo for a kombucha brand called 'WILD FERMENT'. The text should be in a clean, bold, sans-s… |
| nano-banana-pro/04-matte-black-mug-product-shot | google/gemini-3-pro-image-preview | A high-resolution, studio-lit product photograph of a minimalist hand-blown borosilicate glass teapot in clear with copp… |
| nano-banana-pro/05-floral-dress-fashion-fusion | google/gemini-3-pro-image-preview | Create a professional e-commerce fashion photo of a tall woman in her late 20s with auburn hair, wearing a structured em… |
| nano-banana-pro/06-cat-wizard-hat-additive-edit | google/gemini-3-pro-image-preview | A photorealistic still of a fluffy ginger Maine Coon cat sitting on a sunlit windowsill. Add a small, knitted forest-gre… |
| nano-banana-pro/07-chesterfield-sofa-inpaint | google/gemini-3-pro-image-preview | A photoreal interior of a Scandinavian living room with a sage-green linen sofa, two cream wool throw pillows, a small s… |
| nano-banana-pro/08-starry-night-style-transfer | google/gemini-3-pro-image-preview | Imagine a photograph of an empty cobblestone Lisbon street at dusk with yellow tram tracks and ochre buildings on both s… |
| nano-banana-pro/09-fashion-editorial-text-to-image | google/gemini-3-pro-image-preview | A striking fashion model wearing an oversized ivory wool coat, structured loafers, and holding a long-strap leather tote… |
| nano-banana-pro/10-armchair-sketch-plus-fabric | google/gemini-3-pro-image-preview | Imagine a hand-drawn napkin sketch showing the rough silhouette of a barrel-back lounge chair with curved arms and a fab… |
| nano-banana-pro/11-beauty-product-multilingual-text | google/gemini-3-pro-image-preview | A high-end, glossy commercial beauty shot of a sleek, minimalist sage-green serum dropper bottle resting on a warm peach… |
| nano-banana-pro/12-new-york-cutout-typographic-poster | google/gemini-3-pro-image-preview | A typographic poster with a solid black background, bold letters spell 'KYOTO', filling the center of the frame. The tex… |
| nano-banana-pro/13-berlin-architectural-typography | google/gemini-3-pro-image-preview | View of a sun-drenched canal street in Amsterdam on a clear sunny day, stark shadows. The old narrow gabled townhouses a… |
| nano-banana-pro/14-aura-fizz-poster-with-localization | google/gemini-3-pro-image-preview | Create a poster ad for a craft cold-brew coffee called 'LUNA BREW'. The setting is a Tokyo neon-lit alleyway at midnight… |
| nano-banana-pro/15-fluffy-characters-tv-scene | google/gemini-3-pro-image-preview | A medium shot of 12 distinct fluffy hand-puppet style creatures (each with different colored fur, ear shapes, eye sizes … |
| nano-banana-pro/16-chiaroscuro-portrait-edit | google/gemini-3-pro-image-preview | Imagine a soft, evenly-lit portrait of a 50-year-old woman with silver-streaked dark hair, a slight smile, photographed … |
| nano-banana-pro/17-elaichi-chai-infographic | google/gemini-3-pro-image-preview | Generate a step-by-step infographic showing **how to make traditional Italian Tiramisu**. Use the model's world knowledg… |
| nano-banana-pro/18-silent-echo-thriller-poster | google/gemini-3-pro-image-preview | Create a minimalist movie poster for a thriller titled **'NORTH OF NOTHING'**. The text should be large, distressed sans… |
| nano-banana-pro/19-crystal-vs-lava-chess-thinking | google/gemini-3-pro-image-preview | A surreal still life where a violin is made of frozen water and its bow is made of burning iron. The violin is slowly me… |
| nano-banana-pro/20-viral-thumbnail-character-locked | google/gemini-3-pro-image-preview | Design a viral video thumbnail. **Subject (left):** A 28-year-old fitness influencer with a tight ponytail and athletic … |
| nano-banana-pro/21-sprite-sheet-backflip-3x3 | google/gemini-3-pro-image-preview | Sprite sheet of a pixel-art knight performing a sword swing attack animation, 3x3 grid, sequence, frame by frame animati… |
| nano-banana-pro/22-luxury-luggage-9part-storyboard | google/gemini-3-pro-image-preview | Create an addictively intriguing 9-part story with 9 images featuring a man and a woman in an award-winning luxury wrist… |
| nano-banana-pro/23-floor-plan-to-interior-collage | google/gemini-3-pro-image-preview | Imagine a 2D floor plan of a 2-bedroom apartment with living area, kitchen, master bedroom, second bedroom and bathroom.… |
| nano-banana-pro/24-aspect-ratio-locked-character | google/gemini-3-pro-image-preview | Imagine a full-body 1:1 square portrait of a stylized origami crane character standing on a cherry-blossom branch, cente… |
| gpt-image/01-photorealistic-candid-portrait | openai/gpt-5.4-image-2 | Create a photorealistic candid photograph of an elderly Greek shepherd standing on a hillside with his flock of goats. H… |
| gpt-image/02-logo-vector-bakery | openai/gpt-5.4-image-2 | Create an original, non-infringing logo for a company called Tide & Salt, a small-batch artisan sea-salt brand from a co… |
| gpt-image/03-streetwear-ad-with-tagline | openai/gpt-5.4-image-2 | Give me a cool in culture ad / fashion shot for a brand called PULSE. It's a hip young athleisure brand. The ad shows a … |
| gpt-image/04-pitch-deck-slide | openai/gpt-5.4-image-2 | Create one pitch-deck slide titled **"Why Now"** that feels like a real Series B fundraising slide from a YC-backed clim… |
| gpt-image/05-product-extract-opaque-mockup | openai/gpt-5.4-image-2 | Generate a clean e-commerce hero shot: a single matte-black wireless over-ear headphone (imagined product) extracted and… |
| gpt-image/06-product-extract-transparent | openai/gpt-5.4-image-2 | Generate a clean cutout asset: a single sage-green ceramic pour-over coffee dripper (imagined product) on a transparent … |
| gpt-image/07-billboard-mockup-verbatim-text | openai/gpt-5.4-image-2 | Create a realistic billboard mockup of a sleek electric scooter on a Los Angeles sunset boulevard scene. Billboard text … |
| gpt-image/08-multi-image-compositing | openai/gpt-5.4-image-2 | Imagine two source photos: (1) a sunlit Italian piazza with cobblestones, an outdoor cafe and a fountain on the right; (… |
| gpt-image/09-virtual-try-on | openai/gpt-5.4-image-2 | Imagine a base portrait of a woman in her 30s with shoulder-length curly black hair, photographed waist-up in soft windo… |
| gpt-image/10-children-book-character-anchor | openai/gpt-5.4-image-2 | Create a children's book illustration introducing a main character. … |
| grok-imagine/01-photoreal-city-street-portrait | google/gemini-3-pro-image-preview | Photoreal street-style portrait: an adult man (30+) wearing a modern olive-green canvas work jacket walking through a ra… |
| grok-imagine/02-minimal-product-mug-base | google/gemini-3-pro-image-preview | Product photo: a sleek matte-charcoal stoneware bowl sits centered on a clean light-oak wood table, soft daylight stream… |
| grok-imagine/03-product-mug-i2i-style-edit | google/gemini-3-pro-image-preview | Imagine a clean minimal product photo of a matte-charcoal stoneware bowl centered on a light-oak table in soft daylight.… |
| grok-imagine/04-central-park-bench-portrait | google/gemini-3-pro-image-preview | A man in his 40s sitting on a stone bench in the Tuileries Garden, sketching in a small leather notebook, late afternoon… |
| recraft/01-realistic-image-tropical-waterfall | google/gemini-3-pro-image-preview | Photorealistic wide shot of a massive frozen waterfall cascading down a sheer granite cliff in an Icelandic canyon, laye… |
| recraft/02-realistic-image-golden-hour-portrait | google/gemini-3-pro-image-preview | Photorealistic medium portrait of a man in a lavender field at sunset, framing from shoulders up with face and tousled h… |
| recraft/03-realistic-image-perfume-product | google/gemini-3-pro-image-preview | High-end whisky product photography, elegant cut-crystal decanter positioned on a single geometric polished walnut block… |
| recraft/04-realistic-image-scifi-robot-meadow | google/gemini-3-pro-image-preview | A humanoid robot with a polished chrome body standing on a vast salt flat with arms relaxed at its sides, captured from … |
| recraft/05-realistic-image-trex-beach | google/gemini-3-pro-image-preview | A Stegosaurus relaxing in a hot tub, wearing a tiny terrycloth headband and reading a folded newspaper. Realistic photo. |
| recraft/06-realistic-image-red-panda-poster-text | google/gemini-3-pro-image-preview | A capybara eating a watermelon slice in front of a poster that says 'CAPY SZN 2026'. |
| recraft/07-vector-illustration-mountain-landscape-detailed | google/gemini-3-pro-image-preview | Detailed flat vector illustration of a desert canyon landscape at dusk, layered geometric mesas and spires, stylized cac… |
| recraft/08-vector-illustration-minimal-mountain | google/gemini-3-pro-image-preview | Flat vector illustration of an ocean wave breaking onto a shoreline, simple geometric shapes, two-color palette (deep na… |
| recraft/09-vector-illustration-summit-logo | google/gemini-3-pro-image-preview | A minimalist vector logo featuring a geometric origami crane in burnt-orange, with the company name 'Crane Labs' in a mo… |
| recraft/10-logo-raster-pasta-monogram-minimal | google/gemini-3-pro-image-preview | Minimalist coffee brand logo centered in composition, circular icon with brand name integrated as negative space cutout … |
| recraft/11-logo-raster-pasta-vintage-badge | google/gemini-3-pro-image-preview | Vintage badge logo for artisan whisky distillery, circular emblem with barley sheaf and copper still in center, ornate d… |
| recraft/12-icon-pasta-line-monoline | google/gemini-3-pro-image-preview | Line art icon logo for a tea brand, simple outline of a teacup with a steam swirl rising and a small leaf inside the cup… |
| recraft/13-icon-greek-sculpture-negative-space | google/gemini-3-pro-image-preview | logo Renaissance violin, clever negative space |
| recraft/14-digital-illustration-watercolor-child-fox | google/gemini-3-pro-image-preview | Watercolor illustration of a close-up child and a small whale swimming together in a shallow turquoise sea, soft diffuse… |
| recraft/15-digital-illustration-ink-child-fox | google/gemini-3-pro-image-preview | Black ink illustration of a child and a deer walking through a misty pine forest, bold line work, crosshatching shadows,… |
| recraft/16-digital-illustration-hand-drawn-monster | google/gemini-3-pro-image-preview | a monster with lots of eyes on stalks, hand-drawn cartoon style, friendly silly expression. |
| recraft/17-graphic-design-poster-jazz-concert | google/gemini-3-pro-image-preview | Minimal poster design for techno festival, bold magenta headline typography on deep black background, sans-serif letteri… |
| recraft/18-v4-vector-tourism-icon-set | google/gemini-3-pro-image-preview | Create a collection of 12 clean vector kitchen character icons arranged in a grid with four per row (three rows total). … |
| recraft/19-v4-logo-raster-slow-creative-studio | google/gemini-3-pro-image-preview | Minimal playful logo on a deep muted terracotta background with warm off-white or cream elements. Flat colors only — no … |

## Operations

- Manifest of all 57 custom prompts: [`prompts.jsonl`](prompts.jsonl)
- Worker: [`run-one.sh`](run-one.sh) (single render)
- Driver: [`run-batch.sh`](run-batch.sh) (both pools with concurrency control)
- Per-render logs: `.runlog/<folder>-<idx>-<slug>.log`
- Re-run is idempotent — existing PNGs are skipped.
- All generations also land in the `prompts-test-001` Ralphy project (under `workspace/projects/`) — `ralphy project timeline prompts-test-001 -p` to see costs.

## Costs (snapshot 2026-05-21)

| Model | Unit cost | Count | Subtotal |
|---|---:|---:|---:|
| google/gemini-3-pro-image-preview | $0.15 | 47 | $7.05 |
| openai/gpt-5.4-image-2 | $0.20 | 10 | $2.00 |
| **Total** | | **57** | **~$9.05** |
