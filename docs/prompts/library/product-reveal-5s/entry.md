---
goal: Reveal the product in a 3-5s beat after a pain-state setup, with the hand entering frame from screen-right.
applies_to: [video, image]
tags: [product-reveal, hand-in-frame, dtc, before-after, conversion]
models_known_good: [kwaivgi/kling-v3.0-pro, google/gemini-3-pro-image-preview, openai/gpt-5.4-image-2]
models_known_bad: [pika/pika-2-turbo]
references:
  - https://www.tiktok.com/@dtcbrand/video/7456789012
---

# Product reveal — 5s hand-from-right beat

The conversion-anchor scene of the `before-after-product` template. Pain state holds for 5s, then the hand enters and the product locks in.

## Bad

> "A water bottle on a table."

**Why it fails:** No story arc. No reveal beat. Generic still-life — viewer keeps scrolling.

## OK

> "Hand picks up a water bottle from a kitchen counter."

**Why it's just OK:** Has a beat, but the camera is unspecified — Kling adds drift. No identity anchor on the bottle.

## Ideal

> Scene: minimal white tabletop, soft morning light. Character: hand entering frame from screen-right, holding a brushed-aluminum 750ml water bottle with a navy logo. Shot: macro 50mm, locked tripod. Lighting: hard rim light + soft fill. Style: commercial CGI register, color-graded teal/orange. Motion: hand-product-reveal — hand pushes the bottle into frame from right, holds centered at 50% screen height. Dialogue: none. Progression: 3s clip, 9:16, no background music, whoosh + impact SFX at 0.5s.

**Why it works:** Locked composition + named hand entry direction + product identity tokens locked + explicit SFX cue. The Kling adapter consumes this as a Scene/Character/Shot/Motion/Dialogue/Progression block.

## Notes for the adapter

- Use `kwaivgi/kling-v3.0-pro` with a master-shot ref of the product on `--ref`.
- Don't rely on the model to invent the brand color — name it in the prompt.
