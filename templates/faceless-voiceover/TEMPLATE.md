# Faceless Voiceover + B-Roll — vibe style

**Genre:** faceless storytelling / explainer — narration over b-roll, no on-camera presence.
**Length:** 45-90s.
**Format:** YouTube Shorts (king platform), TikTok, Reels. 9:16, 30fps, 1080×1920. Burned-in word-level subtitles mandatory.

> **Reference-required gate (conditional).** No reference required by default. If the brief names a real person, brand, or specific real entity ("the story of Elon Musk", "why FTX collapsed"), the reference-required gate (AGENTS.md hard rule #3) re-engages — drop a photo / logo / packaging or rephrase generically. AI-improvised faces or branded entities always read as fake.

## Why this works

The base format of every successful faceless YouTube channel in 2026:

1. **300% YoY growth.** Bityclips, January 2026 — faceless niche grew faster than any other format.
2. **No camera, no face, no studio.** A laptop and an API key are the entire production stack. Channels generate $1.5K-$8K/mo.
3. **Search-first, evergreen.** Curiosity-hook topics get indexed and keep earning views for months. Unlike trends, the format doesn't decay.
4. **AI-friendly end-to-end.** VO (ElevenLabs), b-roll (Gemini-3 / Kling), captions (Scribe), music (ElevenLabs Music) — all single-API operations. Zero physical production cost.
5. **The hook sells the watch-time.** A 0-2s curiosity claim ("Did you know that Napoleon was actually taller…") flips the viewer's brain into "I need to know" mode. The rest of the video pays it off.

## Vibe anchors

- **Curiosity hook in the first 2 seconds.** Specific, falsifiable, slightly counter-intuitive. Vague hooks ("today we'll talk about history") guarantee a scroll.
- **3-act structure.** Setup (who / what / when) → conflict (the twist, the problem, the mystery) → resolution (the answer, the lesson, the payoff). Dropping any act collapses the format.
- **B-roll changes every 5-8 seconds.** Static b-roll for >8s is a retention killer. The cadence keeps the eye busy while the ear listens.
- **Subtitles always on, word-level.** 85% watch muted. The subtitles are the video's primary surface.
- **Ambient music, ducked under VO (~-12dB).** Music supports tone, never competes with narration. No vocals, no melodic hooks.
- **One claim per video.** Faceless videos that try to teach two things teach neither.

## Variation axes

| Axis | Options |
|---|---|
| Niche | history / finance / psychology / tech / true-crime / mythology / science-trivia |
| VO tone | calm-narrator (default) / dramatic / conversational / detective |
| B-roll source | AI-generated (Gemini + Kling) / stock only / hybrid |
| Subtitle style | Hormozi (default, large impact) / Karaoke (word-by-word highlight) / Minimal (low-key) |
| VO model | `eleven_multilingual_v2` (default) / `eleven_v3` (storytelling drama, true-crime) |
| VO language | any — English (default), Russian, Spanish, etc. |

## Narrative arc

```
0-2s     → Curiosity hook. One sentence. Visual: a single tight b-roll shot that hints at the topic.
2-15s    → Setup. Who / what / when / why we care. B-roll cut every 5-8s.
15-40s   → Conflict / middle. The twist, the unknown, the mystery. 3-5 b-roll cuts.
40-55s   → Resolution. The answer, the explanation, the moment of realization. 2-3 b-roll cuts.
55-60s   → Payoff + CTA. The "now you know" line + "follow for more <niche>".
```

For a 90s video, scale each act linearly (~×1.5). The hook stays at 2s flat — never longer.

## Required user inputs

1. **Topic** — one sentence ("Why Napoleon's height was a translation error", "How a tax loophole turned a barber into a millionaire").
2. **Hook claim** — the falsifiable, counter-intuitive line for 0-2s. (Or: ask the agent to draft 5 from the topic; see `hooks.md`.)
3. **3-act outline** — setup / conflict / resolution. Or: the full script if the user already wrote it.
4. **Niche** — history / finance / psychology / tech / true-crime / mythology / science-trivia. Drives the b-roll vocabulary.
5. **(Optional) VO tone** — defaults to calm-narrator.
6. **(Optional) VO language** — defaults to English.

## When NOT to use

- **Topic that needs a face for trust.** Personal advice, controversial opinion, "I tried this" — the viewer wants to see the human. Use `talking-head-rant` instead.
- **Story can't fit in 90s.** If the explanation needs >90s (a long historical arc, a multi-step finance breakdown), either cut to 90s with a "part 2" cliffhanger or use a long-form format.
- **The claim isn't verifiable.** Faceless thrives on factual, citation-able claims. Vague self-help ("the secret to happiness") doesn't carry.
- **The user has a face and a personality to leverage.** Faceless wastes the asset.
- **Brand-awareness video for a known brand without their reference assets.** Use `before-after-product` or `brand-story` instead.

## Cost ballpark (60s video, 9 b-roll cuts)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes (AI b-roll) | 9 × `gemini-3-pro-image-preview` @ $0.15 | ~$1.35 |
| Video clips | 9 × `kling-v3.0-pro` × 5s @ $0.14/s | ~$6.30 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × Scribe v1 | ~$0.005 |
| Render | local | $0 |
| **Total (full AI b-roll)** | | **~$7.65** |
| **Total (stock b-roll only)** | | **~$0.005** |

The AI vs stock choice swings the budget by ~$7. Hybrid is the typical sweet spot.

## Read also

- `hooks.md` — 12 curiosity-hook patterns with niche fit.
- `prompt-cookbook.md` — master script scaffold, VO settings, b-roll prompt vocabulary, captions, music ducking, 8 mistakes, 4 worked examples.
