# Food & Beverage

Macro-driven food cinematography for TikTok / Reels / Shorts. The whole template is built around one principle: **food video sells desire, not information**. Every frame must make the viewer feel hungry — texture as proxy for flavor, steam as proxy for fresh-and-hot, sound as proxy for taste.

- **Format**: 9:16 vertical (default) or 1:1 square (menu / IG feed). 1080×1920 / 1080×1080.
- **Duration**: 10–20s total. Single hero shot 4–6s. Full plating arc 15–20s.
- **Clip count**: 2–4 i2v clips. One is always the money shot.
- **fps**: 30. Slow-mo bias on hero moments (cheese pull, pour, sizzle, fizz).

## Why this template exists

Generic food prompts produce sad, dim, plastic-looking food. The fix is a vocabulary stack: **food-photography lighting language** (45° warm key, backlight for steam, side light for texture) + **ASMR sound design** (sizzle / crunch / pour / fizz / slurp, one dominant per action) + **money-shot discipline** (every clip builds to one frame the viewer would screenshot). This template carries that vocabulary so the i2v model gets directed, not asked.

## Vibe anchors (always present)

1. **Appetite trigger in the first 2 seconds.** Cheese pull mid-stretch, sauce mid-pour, steam reveal, sizzle on hot pan, ice clink in glass — the hook is a *sensory* event, not a logo or text card.
2. **Texture revelation via macro.** Crumb structure of bread, sear crust on protein, foam head on beer, condensation on glass, sugar crystals on caramel. Macro is the language of flavor.
3. **Color saturation, warm not clinical.** Golden-brown Maillard, deep greens of fresh herbs, jewel tones of berries. Warm color temp (2700–3200K). Never cool fluorescent — that's hospital food, not appetite.
4. **Steam, sheen, condensation = freshness signals.** If the dish is hot, steam must be visible (backlit). If cold, condensation on the glass. If sauced, gloss catching light. These cues are non-negotiable.
5. **One money shot per clip.** The frame the viewer would screenshot. Cheese at maximum stretch, sauce mid-cascade, latte art completed, drink fully poured. Design backwards from this frame.

## Variation axes (mix and match)

| Axis | Range |
|---|---|
| **Category** | fine dining / fast food / baked goods / coffee–café / cocktail–spirits / smoothie–juice / asian wok / italian–mediterranean / BBQ–grill / dessert / health–salad / street food |
| **Tone** | cozy-warm (café, pastry) / luxe-moody (cocktail, fine dining) / playful-energetic (fast food, street) / craft-intimate (recipe, single dish) / fresh-bright (salad, smoothie) |
| **Hero action** | cheese pull / sauce pour / steam reveal / sizzle / knife cut / chocolate snap / glaze drip / fizz–bubble / ingredient cascade / bread tear / latte art / ice clink / flame kiss / first bite |
| **Camera** | overhead push-in / 45° side macro / slow orbit around plate / locked-off action shot / hand–eye POV / extreme close-up |
| **Lighting** | warm window-light (3000K, café/morning) / candlelight ambiance (2700K, fine dining) / bright bounced studio (fast food / product) / moody bar (low ambient + bottle backlight) |
| **Sound** | sizzle / crunch / pour / fizz / chop / bubble / crackle / slurp — pick **one dominant** per action, layer subtle ambience underneath |

## Narrative arc (default 15s)

```
0:00–0:02   HOOK            One sensory event (cheese pull / pour / sizzle / steam reveal)
0:02–0:05   ESTABLISH       The dish in context (plate / cup / bowl / glass on its surface)
0:05–0:10   PROCESS         Action unfolding (plating, garnish, sauce drizzle, knife cut)
0:10–0:13   MONEY SHOT      The climactic frame — the one viewers would screenshot
0:13–0:15   PAYOFF          Final composition / first bite / drink lifted / served
```

For 10s: collapse ESTABLISH and PROCESS into one beat. For 20s: stretch PROCESS to two beats and add a second-angle cutaway to MONEY SHOT.

## Inputs the user must provide

- **Brand / restaurant / product reference** (REQUIRED for any branded item — packaged snack, named restaurant, beverage brand). Photo of packaging, logo, or branded glass / cup / plate. Without this, the gate refuses; AI-improvised packaging on a real brand always fails.
- **Dish or drink description.** Specific noun phrase ("cold-brew with oat milk in a tall glass", "miso ramen with soft-boiled egg, scallion, chili oil"), not a category ("a coffee").
- **Tone preference.** Cozy / luxe / playful / craft / fresh — pick one. Mixing tones reads muddy.
- **Optional but high-value:** a single reference photo of the actual dish (own kitchen photo is fine). Cuts styling errors by ~70%.
- **Surface / setting.** Marble / wood / stone / linen / café counter / bar top. The surface is half the styling.

## When NOT to use this template

- **Talking-head food review.** Use `talking-head-rant` — the camera should be on the person, not the food.
- **Restaurant interior tour / ambiance reel.** This template is dish-first; for venue / vibe walkthroughs use `01-cinematic`.
- **Step-by-step recipe with strong VO instruction.** Possible here, but `09-product-360` style structured beats may fit better if the recipe is the product.
- **Before / after weight-loss / diet ad.** Use `before-after-product` — that's a different conversion pattern.
- **Packaged food ad where the package IS the hero.** Borderline — if the focus is unboxing / package reveal more than the food inside, look at `07-ecommerce-ad`.

## Hard invariants

- **Reference gate (AGENTS.md #3).** Branded restaurant / packaged food / named beverage → user-supplied reference required. Refuse with concrete ask if missing.
- **No clinical cool lighting.** Color temp ≥ 2700K and ≤ 3500K. Cool light kills appetite.
- **Steam must be backlit** when present. Backlight is the only thing that makes vapor visible on i2v output.
- **One dominant sound per action.** Layering five ASMR cues simultaneously creates noise, not appetite. Sizzle OR crunch OR pour, plus low ambience.
- **Macro on at least one shot.** No food video survives without a single tight texture shot. Schedule it explicitly.
- **No fake cheese-pull.** If the prompt asks for cheese stretch, the source frame must show melted cheese geometry the i2v model can extend. Otherwise pick a different hero action.

See `hooks.md` for 10+ proven 2-second openers and `prompt-cookbook.md` for the master template, food-photography vocabulary, and category-specific playbooks.
