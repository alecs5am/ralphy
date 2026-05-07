# Prompt Cookbook — Food & Beverage

This is the working reference for writing food / beverage keyframe prompts (gemini-3-pro) and i2v motion prompts (kling-v3.0-pro). Read `TEMPLATE.md` for the framework first; this file is the vocabulary stack.

---

## Master template

Use this skeleton for every shot. Fill every block — empty blocks are why food prompts fail.

```
SCENE
[Specific location: home kitchen / café counter / bar top / restaurant pass / outdoor market]
[Time of day implies the lighting: golden hour / late evening / morning / mid-day]
[Surface: marble / wood cutting board / linen / ceramic plate / wax paper / cast iron]

HERO
[The dish or drink as a precise noun phrase — not "a coffee" but "a flat white in a 200ml white ceramic cup with a fern rosetta"]

OPENING HOOK (0–2s)
[Pick ONE from hooks.md. Name the action, the angle, the moment.]

ACTIONS
[2–4 actions in order, ending on the money shot. Each is a verb + subject + detail.]

CAMERA
[Movement: slow push-in / locked-off / overhead descend / 45° orbit. ONE move per shot.]
[Lens feel: macro / 35mm equivalent / 85mm portrait. Bias macro for hero.]

LIGHTING
[Key: warm 3000K, 45° camera-left]
[Backlight: yes/no — required for steam, gloss, bubbles, translucent liquid]
[Side light: yes/no — required for crust / texture]
[Avoid: overhead fluorescent, cool white, harsh single-source]

SOUND (ASMR)
[ONE dominant sound matched to the hero action]
[Subtle ambience underneath: kitchen hum / café murmur / bar jazz / outdoor street]

STYLING
[Garnish, props, freshness signals: condensation, steam, sheen, crystals, herbs]
[Negative space: how much empty plate / counter — fine dining = lots, fast food = little]

MONEY SHOT
[The single frame the viewer would screenshot. Describe it as a still image.]

COLOR PALETTE
[Dominant tones: golden-brown / jewel / cream / earth / smoky / pastel]

MOOD & PACING
[Cozy-warm / luxe-moody / playful-energetic / craft-intimate / fresh-bright]
```

---

## Food-photography vocabulary (use these exact words)

### Lighting

- **Warm key light, 45° camera-left, 3000K** — the default for almost every food shot. Reads as "kitchen window" or "restaurant pendant."
- **Backlight** (a.k.a. **rim light**) — the single most important light for food. Required for: steam, gloss, oil shine, glaze, fizz/bubbles, translucent liquids, melted cheese. Without it, these elements *disappear* on i2v output.
- **Side light, raking across the surface** — reveals texture: bread crumb, crust, sear marks, salt crystals, sugar dust. Use for hero macro shots of texture.
- **Bounce / fill** — soft bounced light from camera-right or from below to lift shadows. Prevents the "harsh ad-photo" look. Specify "bounce card camera-right" in the prompt.
- **Diffused window light** — soft, directional, no harsh shadows. The default for café / pastry / breakfast / fresh / bright moods. 2700–3200K.
- **Candlelight ambiance** — 2400–2700K, low ambient, single warm flicker. Use for cocktails, fine dining, intimate dinner scenes.
- **Practical motivated light** — the prompt names a real light source visible in frame (a candle, a pendant, a window, the open oven, a neon bar sign). Reads as "this is real."

### Camera language

- **Macro / extreme close-up** — fills frame with texture (crumb, crystal, droplet). Always include at least one in a multi-clip video.
- **Slow push-in** — the safest move. Keeps the food center, builds anticipation. Use for hero / money shot.
- **Locked-off** — no camera move, only the food / hand moves. Best for pours, sizzles, snaps. Camera stays *out of the way* of the action.
- **Overhead / top-down** — recipe-coded, ingredient layouts, plating reveals. Less hungry, more instructional.
- **45° low** — the appetizing angle for plated food. Shows depth, layers, height. Default for restaurant / dining shots.
- **Eye-level with the dish** — intimate, immersive. Best for first-bite, hands tearing, hero moments.
- **POV (eater's hands in frame)** — first-person. Best for street food, casual eating, hands-on tear/dip moments.

### Texture / styling vocabulary

- **Maillard browning, golden crust, sear marks, char lines, lamination, crumb structure, flake, glaze sheen, oil glisten, sauce coat, sugar crystals, foam head, crema, condensation beads, droplet trail, ice crystals, frost, viscous drip, ribbon, cascade, splash, swirl, pool**.

Bake these words into prompts. They are how the model learns "this is food, render it appetizing."

### Color words

- **Golden-brown, amber, deep ruby, emerald, jewel-tone, cream, pearl, ivory, charcoal, smoke, rust, terracotta, butter-yellow, blood-orange, pistachio-green, raspberry, cocoa, espresso, oat, milk-white, salt-white**.

Avoid: "delicious," "yummy," "tasty," "appetizing." These are vibe-words, not visual words. They don't render.

---

## ASMR / Sound design (one dominant sound per action)

| Action | Dominant sound | Layer underneath |
|---|---|---|
| Sear / sizzle | Loud, sustained sizzle | Faint kitchen hum, gentle music |
| Bite into crispy / fried | Crunch (sharp + extended) | Light chew |
| Pour (sauce, liquid, oil) | Slow viscous pour glug | Background ambience low |
| Soda / sparkling / beer | Fizz, bubble crackle | Pop on opening |
| Knife on cutting board | Rhythmic chop | Wood ring on heavy strikes |
| Simmer / boil | Soft bubble | Pot scrape if relevant |
| Caramel / brûlée torch | Crackle / shatter | Torch hiss |
| Noodle / broth slurp | Slurp | Bowl clink |
| Cheese stretch break | Subtle wet tear | Sizzle from patty |
| Bread tear | Fibrous rip + steam release | Soft morning ambience |
| Latte art pour | Quiet pour + pitcher tap | Café murmur |
| Spirit pour over ice | Glug + ice clink | Bar jazz / vinyl |

**Rule.** Two ASMR cues max in the foreground. A third reads as noise. The mix is: dominant sound (loud) + secondary (quiet) + ambience (very quiet).

---

## Category playbook

### Coffee / Café

**Tone.** Cozy-warm. Ritual, comfort, craft.
**Hero.** Latte art pour completion (#7) or pastry tear with espresso behind (#6).
**Lighting.** Warm window light 3000K, slight backlight catching steam.
**Surface.** Wood counter, marble, ceramic saucer.
**Color palette.** Warm browns, cream, white ceramic, soft golds.
**Sound.** Quiet pour + faint café murmur. No music spike.
**Common mistake.** Cold blue lighting kills it. Café = warm, full stop.

### Cocktail / Bar / Spirits

**Tone.** Luxe-moody. Sophistication, alchemy, ritual.
**Hero.** Spirit pour over single large ice cube (#8) or citrus peel oil express.
**Lighting.** Low ambient bar light (2700K), strong backlight on bottles, side light on glass to show liquid color.
**Surface.** Slate, dark wood, brass bar top, marble.
**Color palette.** Amber, deep brown, ruby, smoke. Liquid color is the hero.
**Sound.** Glug + ice clink + faint jazz / vinyl. No speech.
**Common mistake.** Over-saturating the spirit color reads as juice. Keep amber translucent.

### Dessert / Pastry / Sweets

**Tone.** Cozy-warm or luxe-moody depending on dessert.
**Hero.** Chocolate snap (#11), caramel pour (#2), or croissant tear (#6).
**Lighting.** Warm key + strong side light to catch sugar crystals, glaze, crumb.
**Surface.** Marble (luxe), wood (rustic), parchment (bakery), white ceramic (modern).
**Color palette.** Cocoa, caramel, cream, raspberry, gold leaf, charred sugar.
**Sound.** Snap / pour / tear — all sharp, distinct. Slow-mo doubles impact.
**Common mistake.** Plating too ambitious. One element on a clean surface beats three crowded.

### Snack / Packaged Food

**Tone.** Playful-energetic.
**Hero.** First bite cross-section (#12) or knife cut through filling.
**Lighting.** Bright bounced studio fill + slight backlight on the cut surface.
**Surface.** Wax paper, neutral colored backdrop, branded packaging adjacent.
**Color palette.** Saturated brand colors, golden-brown food, vivid filling.
**Sound.** Crunch (loud, dominant), tear of packaging.
**Reference.** **REQUIRED** — the actual packaging photo. Never let the model invent a label.

### Cocktail / Beverage Brand (canned / bottled)

**Tone.** Fresh-bright or luxe-moody depending on positioning.
**Hero.** Fizz/bubble (#9) or pour over ice with brand visible.
**Lighting.** Backlight through the liquid to make bubbles visible. Brand label side-lit, never in shadow.
**Surface.** Wet bar top, ice bath, marble.
**Sound.** Pop + fizz + pour. Three-beat sequence.
**Reference.** **REQUIRED** — brand label photo. AI-improvised cans always read fake.

### Fresh Produce / Salad / Smoothie

**Tone.** Fresh-bright.
**Hero.** Ingredient cascade (#10), water droplet macro, knife cut releasing juice.
**Lighting.** Bright diffused window light, cool-warm neutral 3500K. The only category where slightly cooler light works (reads as "freshness").
**Surface.** Wood cutting board, white ceramic, linen, marble.
**Color palette.** Vibrant greens, jewel-tone berries, bright citrus.
**Sound.** Chop + water droplet + soft scatter. Light, bright sound design.
**Common mistake.** Wilted herbs. Never include herbs in a prompt unless the brief is shooting in the next 30 seconds visually.

---

## Common mistakes (and the fix in prompt language)

1. **Food looks dim, sad, plastic.** Add `warm key light 3000K, strong backlight, gloss/sheen catching highlights, freshness condensation`. Specify the lighting; don't leave it to the model.
2. **Steam doesn't render.** Steam without backlight is invisible. Add `backlit steam glowing golden, hard rim light through the vapor`. If still missing, drop `steam` and pick a different freshness signal (condensation, sheen, fresh herb).
3. **Cheese pull doesn't stretch.** The keyframe must show melted cheese geometry. Prompt: `melted mozzarella visibly stretching from patty to bun, strand 4 inches long, glossy, backlit`. If keyframe doesn't show the stretch geometry, the i2v will not invent it.
4. **Cool / clinical lighting.** Specify color temp explicitly. `Warm key 3000K, NOT cool white. Avoid fluorescent, avoid daylight 5600K.` Negative prompt the cool tones.
5. **Plating is cluttered.** Rule of three: protein + sauce + garnish. Negative space ≥ 40% of the plate for fine dining, ≥ 15% even for fast food. Prompt: `minimal plating, 3 elements maximum, negative space, single hero focal point`.
6. **Sound feels fake / cartoon.** Don't list six ASMR cues. Pick ONE dominant + ONE secondary. Use real sound vocabulary (`viscous pour glug`, `wet tear`, `dry crunch`, `soft fizz`) not generic (`sound effects of food`).
7. **Camera move fights the action.** Lock the camera when the food is moving (pour, sizzle, snap). Move the camera (slow push-in) only when the food is static. Never move both simultaneously — reads as nausea.
8. **AI-improvised packaging on a real brand.** Always fails the eye test. Reference-required gate refuses without a real packaging photo. No exceptions.

---

## Three worked examples

### Example A — Café morning latte (10s, single hero clip)

```
SCENE     Warm modern café at 8am, soft morning light through tall window
HERO      Flat white in 200ml white ceramic cup, fresh rosetta latte art
HOOK      Final 2 seconds of milk pour — rosetta resolving into focus as pitcher pulls away
ACTIONS   1. Pour stream visible (white foam meeting espresso brown)
          2. Wrist arc creating the leaves of the rosetta
          3. Pitcher pulls up, design completes
          4. Single steam wisp rising from the finished cup
CAMERA    Slow push-in, 45° looking down into the cup, locked once art completes
LIGHTING  Warm window light camera-left 3000K, soft backlight catching steam wisps
SOUND     Quiet pour glug + soft pitcher tap on lift + faint café murmur underneath
STYLING   Cup placed on saucer with small spoon, slight cup warmth steam, no clutter
MONEY     Top-down macro the moment the rosetta finishes — perfect symmetry, foam glossy
PALETTE   Warm browns, espresso crema, milk-white foam, ceramic cream
MOOD      Cozy-warm, slow-paced, ritual, intimate craft
```

### Example B — Spaghetti carbonara plate (15s, 3 clips)

```
CLIP 1 (0–5s)  Hand cracking pepper grinder over plated pasta. Macro side angle, peppercorns
               falling, pasta steam rising. Backlight on steam. Sound: pepper grind + faint
               sizzle from guanciale memory.
CLIP 2 (5–10s) Fork twirling pasta, lifting strands clinging with creamy sauce + visible
               pancetta + raw egg yolk silk. 45° low push-in. Warm key. Sound: soft pasta
               wind + creamy coating sound.
CLIP 3 (10–15s)  MONEY — Macro on the lifted forkful, sauce ribboning, cracked pepper visible,
                 strand sheen catching backlight. Locked-off. Sound: silence except subtle
                 sizzle ambience. Then bite.
PALETTE  Cream, pale yellow yolk, charred guanciale, black pepper crystals, ivory ceramic
MOOD     Craft-intimate, warm, italian trattoria
```

### Example C — Fast-food premium burger (12s, 2 clips)

```
CLIP 1 (0–6s)  HOOK — Top bun being slowly lifted from gourmet burger, melted American
               cheese stretching downward in single strand to maximum elasticity, backlit
               glow on the strand. 45° side, slow push-in, slow-motion. Sound: faint sizzle
               + subtle cheese tear at peak.
CLIP 2 (6–12s) MONEY + PAYOFF — Burger fully assembled, hand bringing it toward camera,
               first bite cross-section: bun, lettuce, patty with sear, melted cheese,
               tomato, sauce. Eye-level. Bright bounced fill + backlight on cheese. Sound:
               crunch + cheese pull + soft bun give.
REFERENCE  Required — actual burger / wrapper / restaurant logo photo at workspace/projects/
           <id>/assets/uploaded/. Cannot be skipped.
PALETTE  Saturated red tomato, golden bun, melted yellow cheese, vivid green lettuce
MOOD     Playful-energetic, indulgent, bold
```

---

## Final pre-flight before render

- [ ] At least one macro / extreme close-up shot
- [ ] Warm key light specified (≤ 3500K, never cool white)
- [ ] Backlight named for any steam / gloss / bubble / translucent liquid
- [ ] One dominant ASMR sound per clip, specified, not generic
- [ ] One named money shot — describe the screenshot frame
- [ ] If branded: real reference photo confirmed at workspace/projects/<id>/assets/uploaded/
- [ ] Negative space appropriate to category (fine dining ≥ 40%, casual ≥ 15%)
- [ ] No "delicious" / "tasty" / "yummy" — only visual words
