---
goal: Stop the scroll in 3 seconds with a single-claim hook line over a creator selfie shot.
applies_to: [video, vo, caption]
tags: [hook, b2b, saas, deadpan, 3s, scroll-stop]
models_known_good: [kwaivgi/kling-v3.0-pro, google/veo-3.1, eleven_multilingual_v2]
models_known_bad: [openai/sora-2]
references:
  - https://www.tiktok.com/@hormozi/video/7234567890
  - https://www.tiktok.com/@codiesanchez/video/7345678901
---

# Hook — B2B / SaaS, 3-second deadpan claim

The 0-3s hook for the YAP / talking-head register. One crisp claim, direct eye contact, no smile, no music, no production polish. Memory: `[[feedback_oldspice_style_dna]]` is the OPPOSITE of this — don't conflate.

## Bad

> "Hey guys! So today I want to talk about productivity hacks…"

**Why it fails:** Greeting + topic-announcement = 2-3 seconds of zero claim. The viewer scrolls.

## OK

> "Most productivity advice is wrong."

**Why it's just OK:** It's a claim, but it's vague. "Wrong how?" can't be answered before the body — viewer abandons in the 1-3s gap.

## Ideal

> "Most people think discipline beats motivation. They've got it backwards."

**Why it works:** Setup-claim-reversal in 8 words. The "backwards" forces a 0.5s mental rewind — exactly the dwell signal TikTok's algorithm reads as engagement. The next sentence is forced because the viewer NEEDS the explanation.

## Notes for the adapter

- VO mode: `deadpan-rant` (`docs/prompts/voice/deadpan-rant.md`).
- Caption: `block-2-words` cadence, headline-sized.
- Video: locked selfie 35mm, no zoom, no cuts.
