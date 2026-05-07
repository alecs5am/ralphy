# Prompt cookbook — faceless-voiceover

Reusable prompt building blocks for `/ralph-art-director` and `/ralph-scenarist`. Combine fresh per project; don't paste verbatim.

## Master template — 3-act script scaffold

A 60s faceless video has a strict beat-grid. Every line below corresponds to a b-roll cue. The agent fills `<topic>`, `<niche>`, and `<hook claim>` — the structure stays.

```
[0-2s] HOOK
  VO: "<one-sentence curiosity hook from hooks.md>"
  B-ROLL: <one tight establishing shot that hints at the topic>

[2-7s] SETUP / BEAT 1 (5s)
  VO: "<who / what / when — context the viewer needs>"
  B-ROLL: <character / place / object that grounds the setup>

[7-15s] SETUP / BEAT 2 (8s)
  VO: "<the second piece of context — the 'wait, but...' setup>"
  B-ROLL: <a complementary shot — different angle, related object>

[15-25s] CONFLICT / BEAT 3 (10s)
  VO: "<the twist or the mystery — what doesn't add up>"
  B-ROLL: <visual that signals tension — close-up, document, contrast>

[25-35s] CONFLICT / BEAT 4 (10s)
  VO: "<the deepening of the conflict — escalation>"
  B-ROLL: <a different angle on the conflict — wider shot, secondary subject>

[35-45s] RESOLUTION / BEAT 5 (10s)
  VO: "<the answer or the realization — the moment the puzzle resolves>"
  B-ROLL: <visual that signals release — open frame, clean composition>

[45-55s] PAYOFF / BEAT 6 (10s)
  VO: "<the lesson, the callback to the hook, the 'so this is why' line>"
  B-ROLL: <callback shot — visually rhymes with the hook frame>

[55-60s] CTA (5s)
  VO: "<follow for more <niche> stories / part 2 tomorrow / link in bio>"
  B-ROLL: <hold on a hero shot — the most striking visual of the set>
```

For 90s, scale beats 3-6 by ~1.5×. The hook stays at 2s flat.

## VO direction (ElevenLabs)

### Default voice settings (calm-narrator)

```json
{
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.45,
    "similarity_boost": 0.75,
    "style": 0.20,
    "use_speaker_boost": true
  }
}
```

### Tone presets

| Tone | model_id | stability | style | Notes |
|---|---|---|---|---|
| calm-narrator (default) | `eleven_multilingual_v2` | 0.45 | 0.20 | Documentary feel. History, science-trivia, tech. |
| dramatic | `eleven_v3` | 0.40 | 0.35 | Storytelling drama. True-crime, mythology. |
| conversational | `eleven_multilingual_v2` | 0.50 | 0.15 | "Buddy explaining a thing". Finance, psychology. |
| detective | `eleven_v3` | 0.42 | 0.30 | True-crime, conspiracy-light. |

### Pacing rules

- **Hook line (0-2s):** ~6-8 words max. Slight emphasis on the surprising word ("**actually** taller").
- **Setup beats:** ~140 words/min. Calm, even. Don't rush.
- **Conflict beats:** ~150 words/min. Slight tempo lift. Use SSML or natural breaks (`...`) before the twist.
- **Resolution + payoff:** ~135 words/min. Slow back down — the viewer is meant to land here.
- **CTA:** flat, plain. Not salesy. The CTA is a footnote, not a pitch.

### Emphasis points

ElevenLabs respects natural punctuation for emphasis. To add weight on a word:
- Comma before it: "..., **actually** taller"
- Em-dash: "— actually taller"
- Period before short clause: "He was. Taller."

Avoid all-caps for emphasis — `eleven_multilingual_v2` reads them character-by-character ~30% of the time.

## B-roll prompt vocabulary

The b-roll's job is to keep the eye busy while the ear listens. The aesthetic should match the niche.

### Core style modifiers (combine 2-3 per prompt)

| Modifier | When to use |
|---|---|
| `cinematic` | Default. Filmic color grade, soft contrast, anamorphic feel. |
| `archival-grade` | History, true-crime. Film grain, slight desaturation, period-correct lighting. |
| `document-style` | Tech, finance. Close-ups of paper / screens / objects, neutral lighting. |
| `dramatic-lighting` | True-crime, mythology. Single-source key light, deep shadows. |
| `editorial` | Psychology, finance. Clean, magazine-photoshoot aesthetic. |
| `museum-piece` | Mythology, history. Object centered, soft museum spot lighting, dark background. |
| `surveillance-style` | True-crime. Slight wide-angle distortion, low contrast, security-cam framing. |

### Niche → visual vocabulary

```
History       → period-correct costumes, archival film grain, sepia or muted color, candlelight or natural light, oil-painting compositions, weathered documents, old maps, dust motes
Finance       → close-up of currency, vintage stock tickers, marble bank lobbies, document-style charts on paper, hand counting bills, calculator close-ups, ledger pages
Psychology    → editorial portrait of an anonymous subject (back-of-head / silhouette), brain MRI imagery, abstract geometric pattern interpretations, soft natural light through windows
Tech          → vintage circuit boards, glowing CRT screens, clean white-room product shots, hands typing on period-correct keyboards, soldering close-ups, schematic blueprints
True-crime    → surveillance-style angles, evidence bags, redacted documents, dimly lit interiors, rain on windows, blue-tinted night exteriors, empty rooms
Mythology     → museum-piece artifacts, candlelit ritual settings, weathered stone carvings, mist and fog, symbolic objects (chalice, sword, mask), dark backgrounds
Science-trivia → macro close-ups (insects, crystals, water droplets), lab glassware, slow-motion liquids, tilt-shift miniatures, microscope-style lighting
```

### Master b-roll prompt scaffold

```
"<modifier 1>, <modifier 2>, <subject> <action>, <environment>,
<lighting>, <camera framing>, 9:16 vertical composition,
no text, no captions, no watermark"
```

### Example b-roll prompts

**History — "ancient ruler" beat:**
> "archival-grade, museum-piece, weathered marble bust of an unidentified ancient ruler on a dark plinth, single warm spotlight from above, deep shadows, slow camera push-in, 9:16 vertical, no text, no captions, no watermark"

**Finance — "tax loophole" beat:**
> "document-style, editorial, hand turning a page in a leather-bound legal ledger, fountain pen resting on the page, warm desk lamp, shallow depth of field, top-down angle, 9:16 vertical, no text, no captions, no watermark"

**Psychology — "cognitive bias" beat:**
> "editorial, cinematic, anonymous subject from behind looking at a wall covered in identical photographs, soft window light from the left, neutral color palette, slow lateral camera move, 9:16 vertical, no text, no captions, no watermark"

**True-crime — "unsolved case" beat:**
> "surveillance-style, dramatic-lighting, evidence bag containing a small key on a metal table, blue-tinted overhead fluorescent, redacted document partly visible, static shot, 9:16 vertical, no text, no captions, no watermark"

### Negative prompt (always include)

> "no text, no captions, no watermark, no on-screen logos, no AI-improvised faces of real people, no signage with readable brand names, no plastic skin, no lens flare overload"

### Camera motion (for kling i2v)

| Motion | When to use |
|---|---|
| `slow push-in` | Reveals, payoffs, hook frames. Default for "land here" moments. |
| `slow pull-out` | Setup beats. Implies "let me show you the bigger picture". |
| `lateral pan` | Setup, conflict. Active without being aggressive. |
| `static` | Resolution, document shots. The viewer should read the frame. |
| `subtle handheld` | Conflict. Adds tension without seasickness. |

Avoid: rapid zooms, shaky cam, whip pans. They read as TikTok-meme energy and fight the documentary tone.

## Subtitle style — word-level burn-in

Mandatory. 85% watch muted. The subtitle is the primary surface.

### Pipeline

```bash
# After VO renders:
ralphy generate captions \
  --project <id> --slot captions-main \
  --audio workspace/projects/<id>/assets/voiceover/vo-main.mp3 \
  --language en \
  --provider scribe-v1 \
  --output workspace/projects/<id>/captions.json
```

`scribe-v1` returns word-level timestamps with `start`, `end`, `confidence`. Burn-in via Remotion using one of:

| Component | When to use |
|---|---|
| `HormoziCaptions` (default) | Maximum impact, large white text + black outline. Universally retentive. |
| `KaraokeCaptions` | Word-by-word highlight. Good for fast-pace conflict beats. |
| `MinimalCaptions` | Low-key, narrator-friendly. Use only if the niche is very upscale (psychology long-form). |

### Caption rules

- **Lowercase by default.** All-caps reads as shouting; mixed-case reads as documentary.
- **2-4 words per visible chunk.** More than 4 = the eye stalls.
- **No punctuation in captions.** ElevenLabs Scribe inserts commas; strip them in post.
- **Position: lower-third (60% from top).** Above the fold of the YouTube Shorts UI overlay.

## Music — ambient cinematic, ducked under VO

### Generation

```bash
ralphy generate music \
  --project <id> --slot music-main \
  --prompt "ambient cinematic underscore, slow strings, soft synth pad, low piano, no vocals, no melody hooks, 60 BPM, broody but not dark, suitable for narration background" \
  --duration 65   # 60s + 5s tail for fade-out
```

### Niche → music modifier

| Niche | Modifier |
|---|---|
| History | "warm orchestral pad, distant horns, low strings" |
| Finance | "minimal piano, subtle electronic pulse, neutral mood" |
| Psychology | "introspective piano, soft pad, slight melancholy" |
| Tech | "subtle synth arpeggio, electronic pad, optimistic neutral" |
| True-crime | "tense low drone, sparse piano, dark ambient" |
| Mythology | "ethereal choir pad, deep strings, mystical" |
| Science-trivia | "curious light synth, playful pad, neutral" |

### Ducking (-12dB target under VO)

The music must sidechain-duck under the VO. Use the `ralphy audio sidechain` recipe:

```bash
ralphy audio sidechain \
  --project <id> \
  --music workspace/projects/<id>/assets/music/music-main.mp3 \
  --voice workspace/projects/<id>/assets/voiceover/vo-main.mp3 \
  --duck-db -12 \
  --attack-ms 80 \
  --release-ms 250 \
  --output workspace/projects/<id>/assets/music/music-ducked.mp3
```

In the Remotion composition, use the ducked mp3, not the original. Final loudnorm post-render via `ralphy render <id> --loudnorm`.

## 8 mistakes (what kills faceless videos)

1. **B-roll changes too slow.** Holding a static shot for >8s is a guaranteed scroll. Cut every 5-8s, no exceptions.
2. **No subtitles.** 85% watch muted. Without captions, you've shipped a podcast.
3. **AI VO too robotic.** Default `eleven_multilingual_v2` at stability 0.7+ sounds like a 2022 Alexa. Drop to 0.4-0.5 and add `style: 0.15-0.30` for human cadence.
4. **Hook too vague.** "Today we're going to talk about history" is a scroll-trigger. The hook must be specific, falsifiable, counter-intuitive (see `hooks.md` checklist).
5. **Wrong facts.** Faceless thrives on factual claims. One wrong claim torches the channel. Verify every hook claim with a citation in `<60s` of search before shipping.
6. **Music competes with VO.** Music with vocals or strong melodic hooks distracts the ear from the narration. Ambient pads only, ducked to ~-12dB.
7. **B-roll doesn't match the VO beat.** If the VO says "in 1907" and the b-roll shows a 2020s skyline, the cognitive mismatch breaks immersion. The b-roll cue lives in the script — write them together.
8. **Trying to teach two things.** A 60s video has time for one claim, one arc, one payoff. Two ideas = neither lands. Cut to one or split into two videos.

## Worked examples

### Example 1 — History: a forgotten ancient ruler

- **Topic:** Queen Hatshepsut of Egypt.
- **Hook (Pattern 4 from `hooks.md`):** "The real story of the pharaoh history tried to erase."
- **3-act:**
  - Setup (2-15s): Hatshepsut becomes pharaoh in 1478 BC. Wears a fake beard. Reigns successfully for 22 years.
  - Conflict (15-40s): After her death, her stepson Thutmose III orders her name chiseled off every monument. For 3000 years, she's a footnote.
  - Resolution (40-55s): In 1822, archaeologists decode hieroglyphs. By 2007, her mummy is identified. The erasure failed — she's now one of the most studied pharaohs.
- **Payoff (55-60s):** "History tried to erase her. It just made her more famous."
- **B-roll vocabulary:** archival-grade + museum-piece. Marble bust, weathered hieroglyphs, candlelit tomb interiors, archaeologist's hand brushing dust off stone.
- **VO tone:** calm-narrator, `eleven_multilingual_v2`, stability 0.45, style 0.20.
- **Music:** "warm orchestral pad, distant horns, low strings".

### Example 2 — Finance: a hidden tax loophole

- **Topic:** The 1031 Exchange in US tax code.
- **Hook (Pattern 2):** "Here's why rich people never sell their real estate."
- **3-act:**
  - Setup (2-15s): When you sell an asset, you owe capital gains tax. Unless you use a 1031 Exchange.
  - Conflict (15-40s): Section 1031 of the IRS code lets you swap one investment property for another and defer the tax. Indefinitely. Forever.
  - Resolution (40-55s): If you die holding the property, your heirs inherit it at "stepped-up basis" — the deferred tax disappears entirely. The loophole has a name in finance: "swap till you drop".
- **Payoff (55-60s):** "Legal. Documented. And almost nobody outside real estate knows about it."
- **B-roll vocabulary:** document-style + editorial. Hand turning a ledger, fountain pen on tax code book, calculator close-up, marble bank lobby.
- **VO tone:** conversational, `eleven_multilingual_v2`, stability 0.50, style 0.15.
- **Music:** "minimal piano, subtle electronic pulse, neutral mood".

### Example 3 — Psychology: a cognitive bias

- **Topic:** The Baader-Meinhof Phenomenon (frequency illusion).
- **Hook (Pattern 12):** "Why does the thing you just learned suddenly appear everywhere?"
- **3-act:**
  - Setup (2-15s): You hear about a rare car model. The next day you see three on the road. Statistically impossible — except it's not.
  - Conflict (15-40s): Your brain didn't suddenly attract more of them. It was always seeing them. It just wasn't flagging them. The reticular activating system filters 99% of sensory input out of awareness.
  - Resolution (40-55s): Once a concept is "tagged" as relevant, the filter lowers. The cars were always there. Your awareness wasn't.
- **Payoff (55-60s):** "Your reality is curated. By a filter you don't control."
- **B-roll vocabulary:** editorial + cinematic. Anonymous subject from behind, identical objects on a wall, soft window light, slow lateral pan.
- **VO tone:** calm-narrator, `eleven_multilingual_v2`, stability 0.45, style 0.20.
- **Music:** "introspective piano, soft pad, slight melancholy".

### Example 4 — True-crime: an unsolved case

- **Topic:** The Tamam Shud case (Somerton Man, 1948).
- **Hook (Pattern 6):** "In 1948, a man was found dead on an Australian beach with a coded message in his pocket."
- **3-act:**
  - Setup (2-15s): December 1948. Somerton Beach, Adelaide. A well-dressed man, no ID, no cause of death. Autopsy: poisoned, but no poison detected.
  - Conflict (15-40s): In his pocket: a slip of paper torn from a rare book. Two words: "Tamam Shud" — Persian for "it is finished". The matching book is found, with a coded message on the back cover. Cryptanalysts try for 70 years. Nothing.
  - Resolution (40-55s): In 2022, DNA from a hair on his death mask is matched to a living relative. His name was Carl Webb, Melbourne electrical engineer. The code is still unbroken.
- **Payoff (55-60s):** "We know who he was. We still don't know why he died."
- **B-roll vocabulary:** surveillance-style + dramatic-lighting. Evidence bag with a torn paper, blue-tinted morgue interior, redacted document, rain on a window, beach at dusk.
- **VO tone:** detective, `eleven_v3`, stability 0.42, style 0.30.
- **Music:** "tense low drone, sparse piano, dark ambient".
