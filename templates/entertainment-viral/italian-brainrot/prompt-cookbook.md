# Italian Brainrot — prompt cookbook

Practical prompt-writing patterns for the three model layers: hero image (if regenerating from scratch), video shot, voiceover. Worked examples below cover the most common character / scenario combinations.

> **Always** start by pulling the canonical hero image from the pool — the visual identity is half the meme. Generating without it produces drift.

## Layer 1 — Hero image (only if regenerating, otherwise pull from pool)

The 33 canonical heroes already live in [`pool/italian-brainrot-characters/`](../../../../README.md). Pull with:

```bash
ralphy assets pull-pool italian-brainrot-characters/<slug> --install <project>
```

**Only regenerate if** (a) the character isn't in the pool, or (b) you need a different angle / context-pose. Then:

### Template prompt

```
<character descriptor from characters.md>, photorealistic 3D render,
cinematic lighting, <context-specific setting>, full-body composition,
9:16 vertical aspect ratio, ultra-detailed, viral TikTok meme aesthetic,
soft global illumination, --ar 9:16
```

### Worked example — Tralalero Tralala on a podcast

```
Three-legged blue shark with white belly and Nike Air Force 1 sneakers
on each foot, photorealistic 3D render, sitting at a podcast desk with
a Shure SM7B microphone in front, studio acoustic foam in background,
neutral lighting, full-body wide shot, 9:16 vertical aspect ratio,
ultra-detailed, soft cinematic studio glow.
```

Model: `google/gemini-3-pro-image-preview` (OpenRouter) — best for character fidelity. Cost: ~$0.04. ALT: `bytedance/seedream-v4`.

## Layer 2 — Video shots

Image-to-video is the right call here. Start from the canonical hero (pulled), animate into the scenario.

### Template prompt

```
<start image: pool/italian-brainrot-characters/<slug>.jpg>
<character> <action verb> in <setting>, <camera move>,
maintain character visual identity, <duration>s, 9:16, 30fps,
cinematic absurd realism, generate_audio: false
```

### Worked example — Tung Tung Tung Sahur in a courtroom

```
[start frame: pool/italian-brainrot-characters/tung-tung-tung-sahur.jpg]
Wooden-log character with baseball bat enters a courtroom, walks
slowly toward the judge's bench while tapping the bat rhythmically
against the marble floor. Slow tracking shot following him from
behind. 6s, 9:16, 30fps. Maintain wooden-log character identity
exactly. generate_audio: false.
```

Model: `kling-v3.0-pro` (image-to-video, 5-8s). Cost: ~$0.18/clip. ALT for budget: `veo-3-fast`.

### Camera vocabulary (steal from this list)

- **Slow push-in** — meme-anchoring, builds tension on the character's face
- **Tracking-behind** — works for any "character walks toward objective" scenario
- **Locked wide** — full-body, no camera movement, the absurd action speaks
- **Whip-pan reveal** — body-action character types (Bombardiro, Cappuccino Assassino)
- **Top-down** — kitchen / desk scenarios; works for Chef Crabracadabra, Frigo Camelo
- **Spinning crane** — Ballerina Cappuccina, music-video moments
- **Handheld POV** — first-person scenarios; the character sees the viewer, breaks fourth wall at the end

### Setting / context bank

| Setting | Best fit characters |
|---|---|
| Kitchen / cooking | Chef Crabracadabra, Frigo Camelo, Cappuccino Assassino |
| Courtroom / formal | Bombardiro Crocodilo, Trulimero Trulicina, Lirili Larila |
| Gym / weightlifting | Chimpanzini Bananini, Brr Brr Patapim, Cocofanto Elefanto |
| Beach / poolside | Burbaloni Lulilolli, Trippi Troppi, Glorbo Fruttodrillo |
| Office / meeting | Pot Hotspot, Frigo Camelo, Trulimero Trulicina |
| Podcast / interview | Tralalero Tralala, Bombardiro Crocodilo, Boneca Ambalabu |
| Space / sci-fi | Bobrito Bandito (Mars), Giraffa Celeste, Trenostruzzo |
| Battlefield / militant | Bombardiro Crocodilo, Bombombini Gusini, Tung Tung Sahur |
| Music / dance | Ballerina Cappuccina, Chimpanzini Bananini |
| Mundane (taxes, DMV, dentist) | Any — comedic engine = mundane × absurd |

## Layer 3 — Voiceover (ElevenLabs)

One TTS call. The gibberish IS the meme. Use the canonical call-sign from [`hooks.md`](hooks.md) at 0-2s, then improvise mock-Italian for the body.

### Template

```
Voice: <Adam | Antoni | Bill | any high-energy male>
Model: eleven_multilingual_v2
Settings: stability=0.35, similarity_boost=0.75, style=0.5, energy=on

Text: <canonical call-sign repeated 2-3 times>, <mock-Italian narration
of what character is doing>, <call-sign final tag>.
```

### Worked example — Tung Tung Sahur courtroom

```
Voice: Adam
Text:
"Tung tung tung tung tung tung sahur. Sahur, sahur, tung sahur.
Avvocato della giudizia, della legge della pasta carbonara,
io sono il legno del tribunale, tung tung tung tung sahur.
Sentenza emessa: bastonata. Tung tung tung sahur."
```

Cost: ~$0.03 for 15s of audio (eleven_multilingual_v2).

## Composition checklist (Remotion)

- [ ] 1080×1920, 30fps, single composition
- [ ] Hero video shot(s) full-bleed
- [ ] Optional phonetic captions (HormoziCaptions yellow) center-frame
- [ ] No music UNLESS the brief specifies (default: VO-only)
- [ ] Total cost guardrail: $0.50 / video at default stack

## Anti-patterns

- ❌ Generating the hero from text without pulling the canonical reference — character drift breaks the meme
- ❌ Trying to translate gibberish into actual Italian — it's phonemes, not language
- ❌ Cramming 2+ characters into one shot — dilutes the format; do a crossover only if explicitly briefed
- ❌ Music on the hook (0-2s) — let the chant land in open air
- ❌ Over-long videos (>30s) — the loop hook works because of repetition density; long-form kills it
