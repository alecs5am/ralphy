# Scene settings — 9 location archetypes

Source: `TheMattBerman/ugc-factory-skill/SCENE_SETTINGS.md` + our own experience.
Used by `/ralph-art-director` on `prepare-prompts` — selecting the `setting` for
each scene.

Each entry provides: prompt fragments (ready-made blocks for image/video prompts),
lighting, a typical camera angle, and which format/persona it best fits.

## 1. Kitchen (counter)

- **Prompt elements:** "kitchen counter, modern apartment, soft morning light
  through window, clean composition, kitchen utensils slightly visible in
  background, shallow depth of field"
- **Lighting:** natural soft daylight (window-side) or warm tungsten in the evening
- **Camera angle:** medium close-up on the talking head; for product — overhead
  or 3/4 high
- **Best for:** mom-blogger, wfh-worker; food/beverage, household, cooking
  apps, beauty (if "morning routine"), any "ordinary person at home"

## 2. Bathroom (mirror)

- **Prompt elements:** "bathroom mirror, modern apartment, even bathroom
  lighting, hand reaching for product, mirror selfie composition"
- **Lighting:** even bright (vanity lights), no harsh shadows
- **Camera angle:** mirror-selfie POV (phone in hand, in the mirror) or face-cam
  close-up
- **Best for:** beauty, skincare, dental, morning routine, an "honest" product
  assessment

## 3. Gym

- **Prompt elements:** "gym interior, soft natural light through high windows,
  fitness equipment slightly out of focus in background, motion blur on
  background figures"
- **Lighting:** mixed (overhead industrial + natural side), high contrast OK
- **Camera angle:** medium-wide (to show the space), close-up on VO moments
- **Best for:** fitness apps, supplements, sportswear, energy drinks, productivity
  ("in the morning after the gym")

## 4. Car (POV from the cabin)

- **Prompt elements:** "POV from driver/passenger seat, car interior at night
  / day, dashboard partially visible bottom, urban environment through
  windshield, motion blur on streetlights, raindrops streaking on windshield
  (if night scene)"
- **Lighting:** night = neon + street lights + dashboard glow; day = natural
  through the windshield
- **Camera angle:** strictly POV (handheld feel), phone tilted slightly
- **Best for:** courier-driver, taxi-driver persona; gig-work apps, fintech
  for the self-employed, navigation, "an ordinary guy talking on the road"

## 5. Office / open-space

- **Prompt elements:** "modern open-space office, monitors with dashboards
  visible (charts/numbers), other workstations slightly out of focus in
  background, even office lighting, business casual environment"
- **Lighting:** flat office overhead (cool white) + monitor glow on the face
- **Camera angle:** medium close-up on the face, monitor partially in frame for
  legitimacy
- **Best for:** marketer-perf, startup-founder; ad tech, analytics,
  performance-marketing tools, B2B SaaS

## 6. Subway / station

- **Prompt elements:** "moscow metro station / train interior, fluorescent
  ceiling lighting, advertisement boards in background blurred, slight motion
  on background passengers, urban commuter atmosphere"
- **Lighting:** harsh fluorescent overhead + station ad-board glow
- **Camera angle:** handheld street-style, slight wobble, selfie-POV or 3/4
- **Best for:** gen-z-energy, courier-driver; "an ordinary situation on the road",
  social platforms, mobile apps, food delivery

## 7. Bedroom / morning light

- **Prompt elements:** "bedroom interior, soft morning light through curtains,
  unmade bed visible in background, person sitting on edge of bed or at desk
  with laptop, intimate domestic atmosphere"
- **Lighting:** soft warm directional sunlight through the curtains
- **Camera angle:** medium close-up, lower height (sitting), warm intimate
- **Best for:** mom-blogger, gen-z-energy, wfh-worker; productivity ("in the morning
  I check what I need to do"), wellness, sleep apps, intimate-tone content

## 8. Street / courtyard

- **Prompt elements:** "russian residential courtyard, panel buildings in
  background slightly out of focus, autumn/winter light, person walking or
  standing near building entrance, urban Moscow / Spb atmosphere"
- **Lighting:** natural overcast (most common in the RU climate) — soft, even,
  cool
- **Camera angle:** handheld walking selfie (vertical), wider shots for context
- **Best for:** courier-driver, wfh-worker; street-food, navigation, lifestyle,
  "an ordinary courtyard" relatability

## 9. Hackathon / coworking

- **Prompt elements:** "hackathon space at night / coworking space evening,
  multiple laptops visible, dramatic low-light environment with intense
  magenta and hot pink LED lighting creating strong color cast, ambient blue
  lights in background, abstract out-of-focus colorful lights"
- **Lighting:** dramatic low-light, magenta/cyan LED ambient, monitor glow
  on the face
- **Camera angle:** selfie POV close (phone in hand), shallow DoF, slight
  natural wobble
- **Best for:** startup-founder, it-remote, gen-z-energy; AI products, dev
  tools, "just built the MVP overnight" content, conference recap

## Use in prompts.json

```jsonc
{
  "scenes": {
    "scene-01": {
      "setting": "hackathon-coworking",       // ← key from this file
      "promptFragments": [
        // the artist copies from the matching block above
        "selfie POV, hackathon space at night, dramatic magenta lighting...",
      ],
      "model": "fal-ai/nano-banana-pro/edit",
      ...
    }
  }
}
```

`/ralph-art-director` does not copy blindly — it adds specifics (the persona's
wardrobe from `personality.context.wardrobe`, props, the angle for the scene-type
from the scenario).

## Anti-patterns

- **Generic stock:** "office workspace, professional setting" — comes out as an
  ad. Use specifics ("3-monitor dashboard, a vlc playlist in the corner").
- **Persona ↔ setting mismatch:** a mom-blogger in a hackathon setting doesn't
  work. Check against the `Best for` in each archetype.
- **Too-bright lighting for "honest UGC":** flat soft light = home/cozy,
  dramatic light = dev/creative/night, the wrong pairing = uncanny.
