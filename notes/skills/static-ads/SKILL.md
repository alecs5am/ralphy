---
name: static-ads
description: |
  Run when the user wants to recreate a winning ad format with their own products and brand copy, or use the /static-ads command. Takes an uploaded ad format reference image, derives the layout structure and copy framework internally, generates on-brand copy variations, then renders static ads via GPT-image-2 using product images from the brand folder. Output saved under the active brand folder.
license: MIT
---

# Static Ads

Recreates a winning ad format with the brand's own products and copy.

Output saved to ./brands/[brand-name]/static-ads/[output-name]/.

Step 1 — Select brand
Scan ./brands/ for subfolders that contain a brand-identity/visual-guidelines.md file.

- One brand found: use it automatically and confirm: "Using brand: [name]"
- Multiple brands found: list them and ask which to use
- None found: tell the user to run /brand first

Step 2 — Upload ad format reference
Create the shared ad references folder if it doesn't exist:

bash

mkdir -p brands/[brand-name]/static-ads/ad-references
Ask:

"Drop the ad format you want to recreate into: brands/[brand-name]/static-ads/ad-references/ Name it descriptively — e.g. calling-screen.jpg, iMessage-format.png. Let me know the filename when it's in."

Wait for the user to confirm. Then read the image from disk using the Read tool.

Analyse it internally. Do not share the analysis or prompt template with the user. Extract:

- Ad format type — e.g. iMessage conversation, countdown urgency, ingredient spotlight, testimonial card, before/after, price reveal
- Layout structure — background colour/texture, sections from top to bottom, visual hierarchy, whitespace logic
- Typography treatment — font weights, sizes, capitalisation, colour usage per text role
- Copy framework — every text slot that exists: its role (headline, subheadline, body, message bubble, CTA, disclaimer, badge, etc.), its tone (casual, urgent, clinical, social), and its position
- Product placement — how the product appears: size, position, angle, crop, lighting treatment, whether it floats or sits in context
- Brand signals — logo placement, colour palette usage, any visual motifs

Extract layout zones — express each content zone as a fraction of total frame height (0.0 = top edge, 1.0 = bottom edge). Use these zone names where applicable:

- text_zone — where headline and sub-headline sit
- product_zone — where the product is placed
- button_zone — where the CTA button sits
- disclaimer_zone — where the disclaimer text sits

Example for a calling-screen format:

json

"layout_zones": {
  "text_zone":       {"top": 0.10, "bottom": 0.35},
  "product_zone":    {"top": 0.40, "bottom": 0.77},
  "button_zone":     {"top": 0.81, "bottom": 0.91},
  "disclaimer_zone": {"top": 0.91, "bottom": 0.97}
}
These zones are used to generate a brand-neutral wireframe at the target aspect ratio. The wireframe is what gets passed to GPT-image-2 as Image 1 — not the original ad. This eliminates color, typeface, and style contamination from the reference, and there is no aspect ratio conflict regardless of the source format.

Construct a prompt template using the zone-based pattern described in Step 7. Store it internally. Do not show it to the user.

Step 3 — Select product(s) and copy variation count
Ask in one message:

"Which product would you like to feature? And how many copy variations do you want?"

Finding product images — always follow this order:

1. Check local folders first:

- brands/[brand-name]/brand-identity/product-images/
- brands/[brand-name]/brand-identity/uploads/ (if it exists)

2. If no matching images found locally — fetch from the brand's website:

Check products.json for a matching product_url. If found, fetch it. If not found, use WebFetch on the brand's main site (from visual-guidelines.md or products.json domain) to search for the product — e.g. fetch [brand-domain]/products or [brand-domain]/collections/all.
If multiple products match the name (e.g. several flavours or sizes), list them and ask the user which to use before proceeding.
Once the correct product page is identified, WebFetch it and extract all product image URLs.
Download each image using curl and save to brands/[brand-name]/brand-identity/product-images/ with a descriptive filename (e.g. electrolytes-sachet-front.jpg).
Add the product to products.json if it isn't already there.
3. If images still can't be retrieved (page blocked, images not accessible, wrong product): ask the user to drop images into brands/[brand-name]/brand-identity/product-images/.

Once images are confirmed, show what will be used:

Product images:

- • electrolytes-sachet-front.jpg
- • electrolytes-sachet-angle.jpg

If only one image is available, note it:

"I found one image for [product]. More angles improve product fidelity — drop additional shots into brands/[brand-name]/brand-identity/product-images/ if you have them, or say 'continue'."

Step 4 — Generate and present copy variations
Read brands/[brand-name]/brand-identity/visual-guidelines.md and brands/[brand-name]/brand-identity/products.json.

Fetch the product page. Look up the selected product's product_url in products.json. If found, use WebFetch to load the page and extract:

- All stated benefits and claims
- Ingredients and their roles (if listed)
- Dosage or usage information
- Any certifications, trust signals, or differentiators
- The exact language the brand uses to describe the product

Use this page content as the primary source of truth for copy — it reflects what the brand actually says about the product, not a generalisation. visual-guidelines.md informs tone; the product page informs substance.

Using the brand's tone of voice, confirmed product claims, and the copy framework derived in Step 2, generate [N] complete sets of copy — one per variation. Each set fills every bracketed copy placeholder in the template with brand-appropriate, conversion-focused copy. Variations should differ meaningfully — different angles, hooks, or messaging approaches, not just word swaps.

Present all variations clearly, numbered. Show only the copy slots — not the full prompt:

## Variation 1

Headline: "..."
Body: "..."
CTA: "..." [etc., one line per copy slot from the template]
Variation 2 ...

Ask: "Happy with these? Edit anything you'd like to change, or say 'confirmed' to generate."

Apply any edits and reconfirm before proceeding. Do not regenerate — just update the relevant copy.

Step 5 — Aspect ratio
Ask in one message:

"Primary aspect ratio? Default is 4:5. Options: 1:1, 4:5, 3:4, 9:16, 16:9." "Any additional aspect ratios to generate from each output? (e.g. 9:16, 1:1 — leave blank to skip)"

Use 4:5 if the user doesn't specify a primary.

Step 6 — Name the output
Derive a slug from the ad format type and product name — format first, then product:

- iMessage-energy-gel
- countdown-magnesium
- ingredient-roller
- Confirm with the user or let them rename.

Step 7 — Create output folder and write spec
Create the output folder:

bash

mkdir -p brands/[brand-name]/static-ads/[output-name]
For each variation, build the complete generation prompt: take the internal prompt template and fill every bracketed copy placeholder with the confirmed copy from Step 4. This produces one fully resolved, ready-to-generate prompt per variation.

Write brands/[brand-name]/static-ads/[output-name]/static-ad-spec.json:

json

{
  "output_name": "iMessage-energy-gel",
  "brand": "puresport",
  "product_name": "Energy Gel",
  "reference_image": "brands/puresport/static-ads/ad-references/iMessage-format.jpg",
  "layout_zones": {
    "text_zone":       {"top": 0.10, "bottom": 0.35},
    "product_zone":    {"top": 0.40, "bottom": 0.77},
    "button_zone":     {"top": 0.81, "bottom": 0.91},
    "disclaimer_zone": {"top": 0.91, "bottom": 0.97}
  },
  "product_images": [
    "brands/puresport/brand-identity/product-images/energy-gel-berry.jpg",
    "brands/puresport/brand-identity/product-images/energy-gel-angle.jpg"
  ],
  "aspect_ratio": "3:4",
  "additional_aspect_ratios": ["9:16"],
  "variations": [
    {
      "slug": "var-1",
      "prompt": "[zone-based prompt for variation 1 — see prompt construction note below]"
    },
    {
      "slug": "var-2",
      "prompt": "[zone-based prompt for variation 2]"
    }
  ]
}
reference_image is stored as a record of the source format. If present in the spec, it is passed to FAL as Image 1 for product-swap formats (neutral backgrounds only). Product images follow as Images 2+.

Structure vs brand — the core rule:

The reference ad belongs to another brand. Treat it as a structural template only — never copy its visual identity.

Take from the reference: layout format, zone positions and proportions, UI element types (toggle switches, countdown blocks, iMessage bubbles etc.), element placement and spacing logic.
Take from visual-guidelines.md: everything visual — background colour, typeface and weights, any accent colours (CTA colour, icon colour, badge colour, toggle colours). These always override whatever appears in the reference.
Before writing any prompt, read visual-guidelines.md and explicitly name the brand's background colour, headline typeface, body typeface, and relevant accent colours. Never leave these to be inherited from Image 1.

Prompt construction for each variation:

Two modes depending on whether reference_image is in the spec:

Mode A — Reference swap (reference_image present): Image 1 is the reference ad. Explicitly override all visual brand elements from visual-guidelines.md. Keep only structure.

"Image 1 shows the reference ad layout. Use it as a structural template only — keep the layout format, zone positions, element placement, and spacing. Replace everything visual with the target brand's identity: background colour [BRAND BG from visual-guidelines], typography [BRAND TYPEFACE + WEIGHT], accent colours [BRAND ACCENT COLOURS]. Replace the product with the exact [BRAND PRODUCT] from images 2+. Replace all copy with [VARIATION COPY]. Replace any third-party trust badge with [BRAND TRUST SIGNAL]. Do not carry over any colour, typeface, or visual treatment from the reference — those belong to another brand. [ASPECT RATIO] aspect ratio. Safe zones: keep the top 10% and bottom 10% of the frame free from text, logos, icons, buttons, and UI elements — photographic content such as hands, arms, or product edges entering the frame is fine."

Mode B — Text-driven layout (no reference_image): Product images are Image 1, 2, .... The prompt carries all layout, brand, and copy instructions from scratch.

"Create: [AD FORMAT DESCRIPTION]. Background: [BRAND BG COLOR]. [ZONE-BY-ZONE DESCRIPTION using brand typefaces, colours, and copy]. Product: exact [BRAND PRODUCT] from images 1+. [ASPECT RATIO] aspect ratio. Safe zones: keep the top 10% and bottom 10% of the frame free from text, logos, icons, buttons, and UI elements — photographic content such as hands, arms, or product edges entering the frame is fine."

Safe zones apply to every prompt in every mode — no exceptions.

Step 8 — Generate
Run once per variation, sequentially:

bash

python3 skills/references/generate-static-ad.py brands/[brand-name]/static-ads/[output-name] var-1
python3 skills/references/generate-static-ad.py brands/[brand-name]/static-ads/[output-name] var-2
Each saves [output-name]-[slug]_v1.png to the output folder.

Product images are uploaded as Image 1, Image 2, ... and passed directly to GPT-image-2 alongside the variation prompt. If no product images are present, the text-to-image endpoint is used instead. The prompt carries all composition, layout, safe zone, and copy instructions.

Cost: ~$0.12 per image.

Step 9 — Reformat for additional aspect ratios
If additional aspect ratios were requested, run the reformat script for each primary output and each additional ratio, sequentially. Always reformat from the primary output — not from another reformatted version:

bash

python3 skills/references/generate-reformat.py brands/[brand-name]/static-ads/[output-name]/[output-name]-var-1_v1.png 9:16
python3 skills/references/generate-reformat.py brands/[brand-name]/static-ads/[output-name]/[output-name]-var-2_v1.png 9:16
The reformat script saves the output to the same folder with the ratio appended to the filename: [output-name]-var-1_9x16_v1.png.

Do not mention this step to the user.

Step 10 — Present results
List all generated files:

Generated:

- ✓ brands/puresport/static-ads/iMessage-energy-gel/iMessage-energy-gel-var-1_v1.png
- ✓ brands/puresport/static-ads/iMessage-energy-gel/iMessage-energy-gel-var-2_v1.png
- ✓ brands/puresport/static-ads/iMessage-energy-gel/iMessage-energy-gel-var-1_9x16_v1.png
- ✓ brands/puresport/static-ads/iMessage-energy-gel/iMessage-energy-gel-var-2_9x16_v1.png
- Ask: "Happy with these? Or would you like to regenerate any variation, adjust the copy, or try a different format?"

To regenerate a specific variation (same prompt):

bash

python3 skills/references/generate-static-ad.py brands/[brand-name]/static-ads/[output-name] var-1
Saves as the next version — does not overwrite.

To change copy for a variation: update the prompt field for that variation in static-ad-spec.json, then re-run.

To add a new aspect ratio after the fact: run the reformat script directly on any existing output.

## Notes

The reference ad is saved to brands/[brand-name]/static-ads/ad-references/. If reference_image is present in the spec, it is passed to FAL as Image 1 — the model uses it as a structural template (layout, zones, UI format). All visual brand elements (background, typeface, colours) are explicitly overridden in the prompt using visual-guidelines.md. Product images follow as Images 2+. Use the reference-image approach when the background is neutral (no dominant third-party brand colour that would bleed). Omit it when the reference background is too strongly branded.
Product images are pulled from brands/[brand-name]/brand-identity/product-images/ and brands/[brand-name]/brand-identity/uploads/ — the more reference angles available, the better the product fidelity in Stage 2.
The prompt template derived from the uploaded ad is never shown to the user — it is stored only in the resolved prompt fields of the spec.
All variations and all aspect ratios live in the same output folder.
Copy is grounded in the live product page — fetched from product_url in products.json. Tone comes from visual-guidelines.md. Run /brand first if these files are missing.
Each brand has its own static-ads/ subfolder — multiple brands can run independent workflows in the same project.
Prompt template reference
When constructing the internal prompt template from an uploaded ad, match the style and specificity of these examples. Every layout element, colour, typographic treatment, and structural detail should be specified. Copy slots are bracketed with a descriptor of the tone and role.

iMessage / DM Conversation
Use the attached images as brand reference for product design ONLY. Do NOT use polished ad layouts. This must look like a real screenshot. Create: a static ad designed to look like a genuine iMessage conversation screenshot. White background. Top: realistic iOS header bar — centered contact name "[FIRST NAME]" in bold black with a gray circular avatar initials icon, small gray "iMessage" label below the name, small blue "<" back arrow left, blue "ⓘ" info button right. Below: a realistic iMessage thread. Three to five message bubbles, alternating sides. Messages from the friend [gray bubbles, left-aligned]: first bubble "[OPENING LINE — casual and natural, e.g. 'wait have you tried [product category] yet?']". Second bubble "[FOLLOW-UP — a specific reason or personal result, conversational, with an emoji]". Messages from the recipient [blue bubbles, right-aligned]: one or two short skeptical or curious replies, e.g. "[REPLY 1]" and "[REPLY 2]". Final gray bubble from the friend: "[CLOSING LINE — product or brand mentioned naturally, recommendation energy, e.g. 'it's called [BRAND], they have a deal rn']". Below the last bubble: a realistic iMessage link preview card — rounded rectangle with [BRAND COLOR] header strip, small product thumbnail left, bold black title "[PRODUCT NAME]" right, gray subtitle "[BRAND] · [TAGLINE or URL]". Timestamp "[TIME]" and blue "Delivered" in small text below. iPhone bottom bar: white background, gray rounded text input field reading "iMessage", camera and audio icons either side. No brand logo overlay. Should look exactly like a screenshot a friend would text you. [ASPECT RATIO] aspect ratio.

## Scarcity / Countdown Urgency

Use the attached images as brand reference. Match the exact product design, colors, and typography style precisely. Create: a high-urgency limited-stock ad on a [BACKGROUND COLOR] background. Top: small [ACCENT COLOR] all-caps label "[URGENCY TAG]" in a rounded pill shape. Below: large bold white uppercase sans-serif headline "[OFFER HEADLINE]". Second line in [ACCENT COLOR]: "[SECONDARY HOOK — e.g. 'Only [N] left at this price.']". Center: product hero shot on the dark background, clean studio lighting with dramatic rim light on one edge. Below the product: a horizontal stock progress bar — [BRAND COLOR] fill approximately [FILL %] full on the left, gray empty track on the right. Left label: "[SOLD COUNT]" in small white text. Right label: "[REMAINING]" in small [ACCENT COLOR] text. Below the bar: a realistic digital countdown timer with four colon-separated blocks — days, hours, minutes, seconds — each in a dark rounded-rectangle tile with white bold monospace digits and small gray labels. Below timer: a large [ACCENT COLOR] rounded-rectangle CTA button spanning most of the width, bold white text "[CTA TEXT]". Very bottom: small gray disclaimer text "[DISCLAIMER]". Brand logo top-right corner in white. [ASPECT RATIO] aspect ratio.

## Ingredient Spotlight / Clean Label

Use the attached images as brand reference. Match the exact product design and brand colors precisely. Create: an educational ingredient-spotlight ad on a [BACKGROUND COLOR] background. Top: small [BRAND COLOR] uppercase pill label "[CATEGORY TAG — e.g. 'KEY INGREDIENT' / 'THE SCIENCE']". Below: large bold [BRAND COLOR or dark] serif or heavy sans-serif headline: "[INGREDIENT NAME]." — just the ingredient name with a period, confident and clinical. Below headline: a dominant close-up photorealistic image of [THE INGREDIENT in natural form], macro shot, sharp focus, soft diffused studio lighting — ingredient fills approximately 40% of the total frame. To the right of or below the ingredient image: three stacked fact rows, each with a [BRAND COLOR] filled bullet or thin left-border line: Row 1: bold "[FACT LABEL 1:]" followed by one sentence on what the ingredient is. Row 2: bold "[FACT LABEL 2:]" followed by one sentence on what it does. Row 3: bold "[FACT LABEL 3:]" followed by one sentence on sourcing, dose, or form superiority. Below the fact rows: product at a slight angle, clean studio lighting, partial crop acceptable. To the left of the product: a small circular trust badge "[TRUST BADGE TEXT]" in [BRAND COLOR] with white text. Brand logo bottom right, small. No stars, no reviews, no CTA button. [ASPECT RATIO] aspect ratio.
