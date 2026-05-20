---
goal: Selfie-distance confessional rant — single character, direct address, 8-15s, deadpan or hyped depending on persona.
applies_to: [video, vo, caption]
tags: [selfie, talking-head, confession, rant, monologue]
models_known_good: [kwaivgi/kling-v3.0-pro, google/veo-3.1]
models_known_bad: [bytedance/seedance-2.0]
references:
  - https://www.tiktok.com/@example/video/7567890123
---

# Selfie rant / confession

Single-creator monologue, selfie distance, direct address to lens. The full surface of the YAP / talking-head-rant template family.

## Bad

> "Me talking on camera."

**Why it fails:** No subject identity, no lighting, no camera spec, no register. Output looks like generic stock.

## OK

> "A 30-year-old man with a beard talking to the camera in his apartment."

**Why it's just OK:** Has identity tokens but no lighting / camera / register. Drift on the 2nd-3rd second.

## Ideal

> Scene: home office, late morning. Character: Alex, 32, dark brown hair short beard navy hoodie. Shot: selfie 35mm, eye-level, handheld with slight sway. Lighting: soft window light from screen-left, ambient indoor LED. Style: Sony FX3 documentary register, naturalistic NOT glossy, slight grain. Motion: lean-in, eyes locked on lens, slight eyebrow raise on the punch word. Dialogue: [Alex, deadpan]: "I'm not going to sugarcoat this." Progression: 5s clip, 9:16, no background music, room tone only.

**Why it works:** Identity tokens locked, lighting + camera + register specified, gesture from the enum, dialogue bracketed correctly for Kling, music explicitly banned.

## Notes for the adapter

- Always ban music explicitly — Kling auto-bakes ambient piano otherwise.
- For RU/KR/etc, drop the dialogue from the prompt and overlay ElevenLabs separately.
