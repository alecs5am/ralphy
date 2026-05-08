# E-commerce Ad — Prompt Cookbook

Distilled from a 10-category playbook. Use the master template, then layer in the category-specific notes, then check text/CTA strategy and the mistakes list before generating.

> Reminder: every frame that shows the product must use the user-supplied reference (multi-ref to `gemini-3-pro-image-preview`). No reference → refuse (see `TEMPLATE.md`).

---

## Master template

Use this structure for every ad. Adapt the bracketed sections to the product, category, and platform.

```
[PRODUCT NAME & CONTEXT]
Generate a [LENGTH]-second e-commerce product advertisement video for [PRODUCT].
Reference: user-supplied product photo at workspace/projects/<id>/assets/uploaded/<file>.

[2s HOOK]
Seconds 0-2: [HOOK TYPE from hooks.md]. [DETAILED VISUAL: composition, lighting,
motion, color]. The product (or a clear visual cue of it) is recognizable by 1.5s.

[PRODUCT SHOWCASE]
Seconds 2-[X]: hero shot, isolated on [BACKGROUND]. [LIGHTING: e.g. key from
top-left 45deg + soft fill]. [CAMERA MOVEMENT: slow rotation / macro pull-in /
static with subtle parallax]. Show [3+ DETAILS specific to the SKU].
Optional inside this beat: macro detail pass on [TEXTURE / MATERIAL / FEATURE].

[LIFESTYLE INTEGRATION]
Seconds [X]-[Y]: product in real-feeling context. [SETTING that matches the
buyer's life, not a stock photo]. [PERSON: framing, action, expression].
[EMOTION the moment conveys].

[BENEFIT / SPEC TEXT]
Animated text overlays during showcase or lifestyle:
- [Benefit 1, max 4 words]
- [Spec / proof, max 5 words]
- [Optional social-proof line]

[CTA — final 3 seconds]
Product returns to hero framing. Text appears:
- Price: "[$XX]" or "[$XX → $YY]"
- CTA button: "[ACTION VERB]" with [animation: pulse / underline / slide-in]
- Urgency: "[Flash sale / Limited / Only N left]"
- Trust optional: "[Free shipping / 30-day return / Lifetime warranty]"

[TECHNICAL]
- Aspect ratio: [9:16 | 1:1 | 16:9]
- Color grade: [LUX warm-gold | TECH cool-blue | WELLNESS soft-natural | FOOD golden-hour | FASHION editorial]
- Music BPM: [80-100 luxury | 90-110 wellness | 120-140 fashion/social | 130-150 tech/trend]
- Camera: [smooth rotations / quick cuts / slow-mo / mix]
- Cut pace: [0.75-1.5s social / 2-3s YouTube]
```

---

## 10 category playbooks

Each is one paragraph: the visual recipe, the recommended hook, the lifestyle context, and the text overlays that convert.

### 1. Fashion & apparel
Lead with **fabric texture macro** or **variant cascade**. Hero shot is a flat-lay or invisible-mannequin rotation showing fit and drape. At least one on-body angle — full-body walk, waist detail, or movement showing how the fabric flows. Lifestyle: morning routine, event, casual day-out — match the SKU's price point. Recommended hook: 6 (cascade) for ranges, 2 (texture) for premium fabrics, 10 (lifestyle) for editorial. Text: size range, material composition, fit guarantee, price, discount. Avoid: dead-static product shots — fashion needs movement.

### 2. Beauty & skincare
Lead with **ingredient explosion** or **before/after**. Hero shot uses light refraction through liquid (amber glass, gold serum) or jar texture. Macro on application — finger picking up product, blending into skin in close-up, glow appearing. Lifestyle: morning ritual, bathroom counter with natural window light, mirror moment. Recommended hook: 2 (texture), 3 (before/after), 7 (ingredient). Text: key actives ("Hyaluronic Acid + Vitamin C"), benefits ("Hydrates. Brightens. Glows."), clinical proof, SPF if relevant, price. The transformation must look earned, not magical — overdone glow reads as filter.

### 3. Electronics & gadgets
Lead with **hero drop** or **unboxing**. Backgrounds are matte-black with accent rim light (blue, white, or warm gold for premium). Macro on tactile details — buttons, hinges, port quality, screen edge. Always include a hand-for-scale shot. Lifestyle: travel, focused work, creator-at-desk. Recommended hook: 1 (drop), 5 (unboxing), 9 (in-hand). Text: specs ("40-Hour Battery", "Active Noise Cancellation"), price, pre-order or warranty trust line. Avoid: cluttered backgrounds — tech reads premium when isolated.

### 4. Food & beverage
Lead with **ASMR action**. Pouring, steaming, sizzling, dripping. Macro on ingredient detail — bean, leaf, crystal, foam. Show the consumption moment (sip, bite, satisfied expression). Lifestyle: golden-hour kitchen, café table, social gathering. Recommended hook: 2 (texture), 7 (ingredient), 10 (lifestyle). Text: key ingredients, flavor profile, dietary tags ("organic / vegan / keto"), price per serving, "limited roast" or seasonal callout. Color grade is always warm — cool grading kills appetite.

### 5. Jewelry & accessories
Lead with **hero drop** on velvet or **macro sparkle**. Hero shot uses dramatic side or back lighting to make stones and metal catch the camera. Always do a 360 rotation. On-body — hand close-up for rings, neckline for necklaces, wrist for bracelets. Lifestyle: proposal, wedding, professional event, everyday luxury. Recommended hook: 1 (drop), 2 (texture), 11 (scarcity for drops). Text: material grade ("14K gold", "VS1 clarity", "2.5 carats"), certification, price, lifetime warranty, free resizing. Soft serif font; warm romantic music (80 BPM).

### 6. Home & furniture
Lead with **lifestyle flash** or **before/after** (cluttered → calm). Hero shot is in-room context — never floating in white void; furniture needs scale. Macro on material quality (wood grain, fabric weave, brass detail). Show the product at multiple distances. Lifestyle: cozy living room, organized workspace, dinner-party table. Recommended hook: 10 (lifestyle), 3 (before/after). Text: dimensions, materials, care, assembly time, color options, price. Warm cozy grading; 90-110 BPM acoustic music.

### 7. Fitness & wellness
Lead with **problem-solution** or **before/after**. Show product in active use — workout, yoga, run. Macro on tech feature (compression panels, moisture-wicking fabric, grip pattern). Lifestyle is not aspirational gym influencer — it's morning workout, recovery, real bodies. Recommended hook: 3 (before/after), 8 (problem-solution), 9 (in-hand for equipment). Text: key tech ("compression", "moisture-wicking"), size range, price, customer rating. Bright natural daylight; 120-130 BPM upbeat.

### 8. Toys & gaming
Lead with **unboxing** or **creator/kid reaction**. Show product in play — moving parts, lights, sounds, modes. Multi-angle on design and color. The moment of a child's joy or wonder is the most converting frame. Lifestyle: child playing, family bonding, solo creative time. Recommended hook: 5 (unboxing), 12 (reaction). Text: age range, key features, battery life, collectibility (series #), "best gift" callout, price. Bright saturated color grade; energetic 130 BPM music. Reference required especially for licensed IP — never improvise character likenesses.

### 9. Automotive accessories
Lead with **problem-solution** or **before/after**. Mount the product on a real car (or convincing reference). Detail of installation, finish, weather-resistance. Functionality demo (opening, rotating, adjusting). Show on multiple vehicle interiors if cross-compatible. Lifestyle: weekend drive, road trip, car-care routine. Recommended hook: 8 (problem-solution), 3 (before/after). Text: compatibility (year/model range), material, install difficulty, weather rating, price. Cool neutral grading; 110-120 BPM modern.

### 10. Pet products
Lead with **creator/pet reaction** or **lifestyle flash**. The genuine pet expression — tail wag, head tilt, focused chewing — is the conversion moment. Detail shots of durability, material safety, design. Lifestyle: playtime, grooming, feeding, cuddle. Recommended hook: 12 (reaction), 10 (lifestyle). Text: species/size compatibility, material safety ("non-toxic", "BPA-free"), durability claim, price, "pets love it" testimonial. Warm soft natural light; 90-110 BPM upbeat-cozy. The pet must look like the user's reference if branded (e.g., a particular breed in marketing).

---

## Text & CTA strategy

### Placement
- **0-2s hook beat.** Optional: 3-5 word problem statement or attention phrase. Large, bold, high-contrast. Fade-in or pop animation.
- **Showcase middle.** Benefit ("Waterproof. All-Day Wear."), social proof ("4.9 stars · 5,847 reviews"), feature callout ("Made in Italy"). Stagger; never two overlays at once.
- **Final 3s CTA.** Price (or strikethrough discount: "$68 → $49"), action verb ("Shop Now / Get It Today / Pre-Order"), urgency ("48hr Sale / Only 12 Left / Ends Sunday"), trust ("Free Shipping / 30-Day Return").

### CTA animation
Slide-in with bounce / pop with scale / glow pulse / animated underline / button-shape with hover-state. Pick one — never combine.

### Font / readability
Sans-serif always (serif okay only for jewelry / luxury fashion). Min 24pt mobile. Max 8 words per overlay. WCAG AAA contrast. No thin / delicate fonts — bold reads.

### Social-proof copy that works
"⭐ 4.9 (5,847 reviews)" · "👥 50K+ customers" · "✅ Trending on TikTok" · "🔥 Viral bestseller" · "🏆 Award-winning". Always specific numbers — vague proof reads as fake.

---

## Common mistakes

1. **Hook doesn't hook.** Generic, slow, or text-only. Fix: pick a visual hook from `hooks.md`. If you wouldn't stop scrolling, neither will they.
2. **Too much text.** Overlays cover the screen, copy is essay-length. Fix: max 5-8 words per overlay, one message per 5 seconds, benefit > feature > price.
3. **No lifestyle.** Product floats in studio void the whole video. Fix: 30-40% of run-time should be in-context.
4. **CTA missing or weak.** Video ends without next step. Fix: final 3s = action verb + price + urgency. Always.
5. **Wrong music BPM.** Luxury at 140 BPM feels frantic; tech at 90 BPM feels sluggish. Fix: match category (see playbooks above).
6. **Cuts wrong-paced.** Jarring or dragging. Fix: 0.75-1.5s for social hook + showcase, 2-3s for lifestyle / CTA. Match cuts to music beats.
7. **Vague prompt.** Output doesn't match vision. Fix: specify lighting angle, camera movement, exact timing, color grade, reference product details.
8. **Wrong aspect ratio for platform.** TikTok cuts off sides on 16:9. Fix: generate for the actual target platform — 9:16 default for TikTok / Reels / Shorts.
9. **Product doesn't look premium.** Flat lighting, washed colors. Fix: dramatic side or top-left key, rim light to separate from background, warm-for-luxury / cool-for-tech grading.
10. **Hallucinated branding.** AI invented a logo or packaging detail because the reference was missing or low-res. Fix: refuse the run and request a clean reference photo.

---

## Worked examples

### Example A — Skincare serum (20s, 1:1, IG Feed)

```
2s hook (0-2s): macro before-state of dull, slightly uneven skin. Text "Dull Skin?"
in white sans-serif. Pull back to woman's face, slight frown.

Reveal (2-4s): hand holding amber-glass serum bottle (REFERENCE: user-supplied
product photo). Light refracts through golden serum inside. Text "Hyaluronic
Acid + Vitamin C".

Macro ingredient (4-6s): close-up of serum texture — glossy, lightweight,
faint shimmer. Text "Hydrates. Brightens. Glows."

Application + transformation (6-16s): finger touches serum, brings to face,
blends in macro close-up. Cut to her face: skin reads more radiant. She looks
in mirror, light smile, touches cheek.

Benefits (16-18s): staggered text — "Clinically Proven Results" / "Visible
Glow in 3 Days" / "100% Natural Ingredients".

CTA (18-20s): bottle returns to center, soft glow. Price "$68 → $49". CTA
"SHOP SERUM" with animated underline. Urgency "Flash Sale Ends Tomorrow".

Specs: 1:1, warm wellness grade, 110 BPM uplifting acoustic, smooth macro
zooms, golden window light.
```

### Example B — Wireless earbuds (20s, 9:16, TikTok / Shorts)

```
2s hook (0-2s): hero drop. Earbuds descend on matte-black background with
blue accent rim. Soft glow on landing. Text "SILENCE PERFECTED" mid-drop.

Unboxing (2-5s): hands open sleek black box (REFERENCE: user-supplied case
photo). Earbuds in custom compartment. Text "Award-Winning Design".

Showcase rotation (5-12s): earbuds on white, smooth 360. Front, curved-fit
side, touch-control macro, charging case detail, hand-for-scale.

Specs (10-12s): stagger — "40-Hour Battery" / "Active Noise Cancellation" /
"Premium Titanium Build".

Lifestyle (12-18s): quick cuts — flight, modern office, gym run, late-night
desk with subtle blue glow on the buds.

CTA (18-20s): hero shot returns. Price "$199 → $149". CTA "PRE-ORDER NOW".
Urgency "Ships in 48 Hours". Trust "2-Year Warranty".

Specs: 9:16, cool tech grade, 130 BPM modern electronic, smooth rotations
+ quick lifestyle cuts, accent blue lighting.
```

### Example C — Specialty coffee (18s, 1:1, IG / Pinterest)

```
2s hook (0-2s): macro of beans cascading into a burlap sack (REFERENCE: user
bag photo for the brand mark). Beans-falling sound. Text "Crafted. Roasted.
Perfected." in warm serif.

Ingredient moment (2-5s): single bean, glossy with natural oils. Pull back
to full harvest, subtle steam. Text "Single-Origin Ethiopia".

Brewing (5-11s): rapid ASMR — beans into grinder, grinding, powder into
filter, water pouring, dark drip into cup, final crema layer. Each shot lit
warmly.

Lifestyle (11-16s): hands lifting cup. Person by bright window, golden
hour, takes a sip, slight satisfied expression. Text "Your Morning Ritual".

CTA (16-18s): bag of beans on warm neutral background. Price "$18/bag" or
"Subscribe & Save 20%". CTA "GET FRESH". Trust "Fair Trade. Sustainable."

Specs: 1:1, warm food grade, 90 BPM acoustic, macro zooms + slow pours.
```

---

## Final checklist before render

- [ ] Hook is visual, stops scroll in <1.5s.
- [ ] Product is recognizable in every frame it appears (reference-anchored).
- [ ] At least one hero shot, isolated, perfectly lit.
- [ ] At least one multi-angle pass (rotation OR macro detail OR variant cascade).
- [ ] Lifestyle beat takes 30-40% of run-time.
- [ ] Text overlays max 8 words, high contrast, sans-serif.
- [ ] CTA in final 3s with action verb + price + urgency.
- [ ] Aspect ratio matches the target platform.
- [ ] Music BPM matches category.
- [ ] Cut pace matches platform (0.75-1.5s social, 2-3s YouTube).
- [ ] No hallucinated logos / packaging / readable text on the product.
