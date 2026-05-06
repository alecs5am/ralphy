# Talking Head Rant — vibe reference

**Genre:** character-driven monologue, 15-22s, deadpan ranting tone, optionally with a hook screenshot overlay.
**Length:** 15-22s (default 18).
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

## Why this format works

Top UGC pattern for ads, personal channels, and hot-take content from 2025-2026 onward:

1. **Hook screenshot in the first 3 seconds.** A Reddit post, a news headline, a chat message — gives the brain "this video will be about X" and buys retention.
2. **Single-character close-up.** The talking-head format feels intimate, like a 1-on-1 conversation.
3. **Deadpan tone.** The character isn't trying to be funny and isn't overacting. The viewer registers it as "this is a real person talking, not an ad."
4. **15-20 second window.** Long enough to say something substantive, short enough not to overstay.

## Vibe anchors

- **Photorealistic character**, not a stylized illustration.
- **Single setting throughout** — don't cut between locations. Continuity = immersion.
- **Eye contact with camera** — character looks straight in (or 5° off-axis for naturalism).
- **Subtle motion** — head bobs, eye blinks, slight body shifts. No fast cuts within the talking-head shot.
- **Background matches the archetype.** Remote IT worker → home office. Courier → driver seat or street. Stay-at-home creator → kitchen.

## Characters (8 universal archetypes)

The template ships with 8 archetypes that translate into any market. Pick one based on the rant subject; localize the look and props in the prompt.

- **Remote IT worker** — 25-32, hoodie / sweatshirt, cluttered home office, mechanical keyboard, multiple monitors.
- **Courier / delivery driver** — 25-35, work jacket (no visible brand), driver seat or sidewalk.
- **Student** — 18-23, hoodie, cafe / dorm hallway, laptop and coffee.
- **Stay-at-home creator** — 28-35, casual home wear, modern kitchen, plants, kid's stuff blurred behind.
- **Office worker** — 25-40, button-down shirt, open-plan office, fluorescent lighting.
- **Gen-Z urban** — 16-22, streetwear (bucket hat, oversized fits), city sidewalk or graffiti wall.
- **Startup founder** — 30-40, sleeker dress code, coworking space.
- **Performance marketer** — 25-35, business casual, neutral office.

Match archetype to subject:
- IT-life rant → remote IT worker.
- Cost-of-living rant → courier or stay-at-home creator.
- Dating monologue → Gen-Z urban or student.
- Hustle culture take → startup founder or performance marketer.

`fragments.md` has full prompt seeds for each archetype.

## Variation axes

| Axis | Options |
|---|---|
| Character archetype | 8 options above |
| Rant subject | work, dating, prices, IT life, transport, food, parenting, the news |
| Hook screenshot | Reddit post / news headline / chat / tweet / TikTok comment |
| Tone | deadpan / frustrated / sarcastic / resigned |
| VO language | any — the format is character-driven, not language-specific |

## Narrative arc (shape, not prescription)

```
0-3s    → Hook screenshot overlay (Reddit post or news). Character in the background, screenshot covers 60-70% of the frame.
3-4s    → Screenshot fades out. Character now front and center.
4-13s   → Body of the rant — 3-4 micro-points in the monologue.
13-18s  → Punchline / outro — the most memorable line.
```

## Hook screenshot examples

**Reddit:**
> r/AskRussia • 2 days ago
> "Why does <X> in <country> <verb>?"
> 1.2k upvotes

**News headline:**
> "Government announces new <X> tax — citizens angry"

**Chat message:**
> [iMessage] Mom: "Have you eaten today?"

**Tweet:**
> "@user just lost his @ for X. Welcome to 2026."

## Required user inputs

1. **Subject** — what the rant is about (1-2 lines).
2. **Hook source** (optional) — a specific screenshot path, or "make one up" → chat generates it.
3. **Archetype** (optional) — if not specified, infer from the subject.
4. **VO language** (optional) — defaults to English; works in any language.

## When NOT to use

- A product showcase / demo (the talking-head can't carry a visual product reveal — use `before-after-product` instead).
- A rant longer than 25s — overstays welcome.
- Multiple characters — this format is single-character.
- Brand promo with required logo placement — logos don't fit naturally in a talking-head.

## Cost ballpark per video

| Stage | Detail | Cost |
|---|---|---|
| Character image | `gemini-3-pro-image-preview` | $0.15 |
| Talking-head video | `veo-3.1` × 15s | $7.50 |
| VO | ElevenLabs (subscription) | $0 |
| Captions | `whisper-1` | ~$0.001 |
| Music | ElevenLabs Music (subscription) | $0 |
| Render | local | $0 |
| **Total (premium)** | | **~$7.65** |

`veo-3.1` dominates cost. If `kling-v3.0-pro` lip-sync is acceptable (slightly worse but captions hide most desync), the same 15s clip is $2.10 instead of $7.50, total **~$2.25**. Use kling for bulk batches; veo for one-shot premium.

## Read also

- `fragments.md` — character prompts + hook screenshot generators + monologue formulas.
- `model-stack.md` — concrete `ralphy generate` commands and the veo vs kling trade-off.
- `composition.md` — Remotion skeleton with the hook-screenshot overlay timing.
- `reference-example.md` — placeholder; fills in after the first real run.
