# Brainrot AI Meme — vibe style reference

**Genre:** chaotic fast-paced AI video — top-half AI narrative + bottom-half hypnotic gameplay loop + screaming word-by-word captions.
**Length:** 30-60s, optimal ~45s.
**Format:** TikTok / Shorts / Reels, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** The bottom-half gameplay loop (Subway Surfers / Minecraft Parkour / GTA / Rocket League / similar) is required. The user either supplies a clip at `workspace/projects/<id>/assets/uploaded/gameplay-loop.mp4` or explicitly sanctions a generic royalty-free placeholder. Without that, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised gameplay always reads as obviously fake and the format collapses.

## Why this works

The dominant AI-generation format of 2026, and the one the platform must ship a first-class template for:

1. **Pattern interrupt.** Two unrelated things on screen at once — a serious narration on top, hypnotic gameplay on the bottom — overrides the scroll reflex. The viewer pauses to figure out what they're looking at.
2. **'What am I watching' = algo signal.** Confusion-comments and high replay-completion are exactly what TikTok / Shorts / Reels rank on. The format farms both naturally.
3. **AI-cheap to scale.** A single template + new VO topic = a new video. The AI Cinema fruit channel pulled 39M views on this exact pattern (AIimagetovideo.pro). One affiliate clocked ~$13K on a single AI-driven brainrot.
4. **C2PA-ready.** TikTok now flags 1.3B+ AI videos via C2PA. The format is mainstream-accepted, not a gray-zone gimmick — provided you mark it.
5. **Edutainment angle works.** The most durable niches dress factual content in chaotic packaging: history facts, finance trivia, psychology, conspiracy, true crime. The gameplay does the dopamine work; the VO does the value.

## Vibe anchors

- **Top-half narrative carries the value.** Either a single AI image held with subtle Ken Burns, or 2-3 short kling-v3.0-pro b-roll clips that loosely illustrate. The visual does not need to be precise — it needs to be *evocative*.
- **Bottom-half gameplay carries the dopamine.** Continuous, hypnotic, no cuts. Subway Surfers / Minecraft Parkour are canonical for a reason — pure forward motion, no failure states visible.
- **SCREAMING word-by-word captions** sync to VO and sit on the seam between the two halves, full-bleed. Yellow Hormozi default; red-shake for the chaos niches (true crime, conspiracy).
- **AI VO, not human.** The robotic-but-confident narrator is part of the genre signature — fighting it loses the format. Adam / Onyx / similar deep-male presets at stability ~0.3.
- **No music by default.** Gameplay diegetic SFX + VO carry. Adding music dilutes both.
- **Mandatory `AI-generated` disclosure overlay** top-right corner. C2PA + on-screen text. Not optional in 2026.

## Variation axes

| Axis | Options |
|---|---|
| Gameplay choice | Subway Surfers / Minecraft Parkour / GTA / Rocket League / soap-cutting / kinetic-sand |
| VO tone | Reddit-narrator monotone / dramatic narrator / sarcastic / conspiratorial whisper |
| Caption style | yellow Hormozi / red-screaming-shake / multicolor-per-word |
| Niche | history fact / finance trivia / psychology / true crime / conspiracy / education-disguised / hot take |
| Top-half visual | single static AI image / 2-3 kling b-roll clips / AI avatar talking head |

## Narrative arc

```
0-2s    → SCREAMING text hook on screen, VO already started.
          ("DID YOU KNOW THAT…", "POV YOU JUST LEARNED…", "THIS MAN DID *WHAT*")
2-15s   → Setup. Establish the topic. Captions hammer key nouns.
15-35s  → Body. The fact / story / hot take unfolds. Gameplay loops continuously underneath.
35-42s  → Twist or escalation. The 'wait until the end' payoff. Captions often go red here.
42-45s  → Outro. Single line — "follow for more", or a question to seed comments.
```

Total ~45s is the sweet spot. <30s feels rushed, >60s loses retention.

## Required user inputs

1. **Topic / script** — either a finished VO script, or a niche + bullet points to script from.
2. **Gameplay-loop clip** — `gameplay-loop.mp4` at `workspace/projects/<id>/assets/uploaded/`. **REQUIRED**, or explicit sanction of a royalty-free placeholder.
3. **(Optional) VO style** — defaults to dramatic narrator (Adam preset).
4. **(Optional) Caption style** — defaults to yellow Hormozi.
5. **(Optional) Top-half mode** — defaults to single static AI image with Ken Burns.

## Reference-required gate (hard refuse)

If the brief implies brainrot-style content but no `gameplay-loop.mp4` exists at the expected path:

> "Brainrot format needs a gameplay-loop clip in the bottom half. Drop a Subway Surfers / Minecraft Parkour / GTA / Rocket League clip into this chat (any length ≥30s, 9:16 or wider), or say 'use a generic placeholder' and I'll wire in a CC0 gameplay loop."

If the brief names a specific real person, brand, or copyrighted IP for the top-half narrative (e.g. "make a brainrot about Elon Musk"), a reference image for that subject is also required, per AGENTS.md hard rule #3.

## When NOT to use

- **Sober tone needed.** Corporate, medical, luxury, B2B trust-building — brainrot reads as unserious and tanks credibility.
- **Audience that hates 'AI slop'.** Engineering Twitter, design Twitter, certain finance-pro audiences will downvote on sight. Check the audience first.
- **Platforms that crack down on AI-slop.** YouTube has signaled deprioritization for low-effort AI content. Brainrot survives on YouTube only with strong scripting and visible human hand on the narrative.
- **Length > 60s.** Retention drops sharply. If the topic needs longer, split into a series.
- **Single-frame story.** If the narrative collapses to one image, this format wastes the dopamine layer — use a static talking-head instead.
- **Sound-off platforms.** This format is VO-driven. If the surface autoplays muted (some Reels placements), the captions must be exhaustive.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Top-half visual | 1 × `gemini-3-pro-image-preview` @ $0.15 (static mode) OR 2-3 × `kling-v3.0-pro` × 5s @ $0.14/s | $0.15 - $2.10 |
| VO | 1 × ElevenLabs `eleven_multilingual_v2` (~45s, subscription) | $0 |
| Captions | 1 × ElevenLabs Scribe v1 word-level (subscription) | $0 |
| Gameplay loop | user-supplied or CC0 | $0 |
| Music | off by default | $0 |
| Render | local | $0 |
| **Total (static top)** | | **~$0.15** |
| **Total (kling top)** | | **~$2.10** |

The cheapest format in the pack when run in static-image mode. Designed to be batched at volume.

## Read also

- `hooks.md` — 12 brainrot opens with audio cues and stop-the-scroll mechanics.
- `prompt-cookbook.md` — split-screen Remotion composition spec, ElevenLabs voice picks, caption style references, gameplay-loop sourcing, C2PA disclosure recipe, 8 mistakes, 4 worked examples.
