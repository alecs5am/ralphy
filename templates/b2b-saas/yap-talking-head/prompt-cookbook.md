# Prompt Cookbook — YAP Talking-Head

Reusable building blocks for `/ralph-art-director`. Combine fresh per project; don't paste verbatim. Always check `MODELS.md` before hardcoding any model ID — Claude's training is stale.

## Master template (single shot + captions + headline)

A YAP video is one composition with three rendered layers and one optional bed:

```
[layer 1] talking-head video clip          (veo-3.1 or kling-v3.0-pro, 30-60s, generate_audio: false)
[layer 2] VO audio                         (eleven_multilingual_v2, single take)
[layer 3] caption track                    (Scribe v1 word-timestamps → HormoziCaptions / TikTokCaptions / KaraokeCaptions component)
[layer 4] headline overlay                 (Remotion <Sequence> from frame 0 to frame 30, fade-out 6 frames)
[layer 5] (optional) music bed             (ElevenLabs Music, ducked to -22 LUFS under VO)
```

There is no scene-list. There is no b-roll. The only "edit" is the headline fade and (in batch jobs) a kling-segment crossfade if you stitched 5-10s clips. Resist the urge to add cuts — every cut breaks the YAP read.

## Talking-head prompt vocabulary

The keyframe is generated once with `gemini-3-pro-image-preview` (multi-ref if a persona reference exists). The same keyframe seeds the i2v call. Treat the keyframe prompt as a recipe of five vocabulary slots.

### Slot 1: framing

> Phone-shot medium close-up, lens at face height, head and upper chest in frame, slight selfie-arm geometry (the implied phone is 50-70cm from the face). Eye-line slightly above lens center.

Avoid: cinema-grade framing, wide shots, low-angle hero shots — all of these break the raw read.

### Slot 2: lighting

> Soft, naturalistic light: a window 30-45° camera-left, no fill bounce, no rim. Skin reads slightly warm. Background falls 1-1.5 stops below the face.

Alternates:
- **Ring-light-as-window:** "Diffused frontal light from camera-left, single soft source, ring-light-as-window quality."
- **Outdoor open shade:** "Open shade outdoors, overcast diffusion, no direct sun, even soft skin tones."

Avoid: cinema 3-point, neon, colored gels, dramatic shadows.

### Slot 3: setting

Match to archetype:

| Archetype | Setting prompt |
|---|---|
| Entrepreneur | "Modern home office or coworking nook, blurred bookshelf or city window, laptop edge in periphery, no logos visible." |
| Educator | "Clean home setting, neutral wall behind, plant or framed artwork softly out of focus, books or notebook in periphery." |
| Contrarian | "Any of the above, but tighter — background blurred to abstraction, almost solid color, focus 100% on the face." |
| Coach | "Bright minimal interior — kitchen, gym corner, or clean studio — high-key, energetic, plant or window." |

### Slot 4: energy / pose

> Lean-into-camera posture, shoulders square, hands at chest height occasionally entering frame for emphasis. Eyes locked on lens. Subtle micro-expression: alert, conviction-driven, mid-thought.

Tone modifiers:
- **Energetic-Hormozi:** "Forward shift, wide eyes, hand chops on emphasis, slight smile readiness."
- **Calm-but-firm-coach:** "Settled torso, steady hands, slow blinks, voice-of-authority calm."
- **Contrarian-pointed:** "Single raised eyebrow, hand pointing toward camera on the key word, half-smile."
- **Warm-educator:** "Open palms, soft smile, occasional nod, easy eye contact."

### Slot 5: technical

> Phone-grade lens character (28mm-equivalent, mild barrel, no anamorphic), 4K-clean, no film grain, no color grade, no LUT — flat, raw, broadcast-natural.

Avoid: "cinematic," "filmic," "moody," "color graded" — every one of these adjectives degrades the YAP read.

## VO direction (ElevenLabs)

Single take. One voice. ~30-60s. Energy NOT smoothness.

### Settings (eleven_multilingual_v2)

```json
{
  "stability": 0.35,
  "similarity_boost": 0.7,
  "style": 0.4,
  "use_speaker_boost": true
}
```

Why this combo: stability low (0.35) lets the voice break, breathe, accelerate — that's the human signal we're after. similarity_boost moderate-high (0.7) keeps the voice consistent across the take. style 0.4 leans into the speaker's natural prosody. Speaker boost on for clarity at low listener volume.

Do **not** use stability 0.6+ — it produces the smoothed-out audiobook read that YAP is supposed to be the antidote to.

### Pacing target

~2.5 words per second over the body of the monologue. A 45s YAP holds ~110 words of VO. If the script is longer, shorten the script — don't speed up the VO; sped-up VO reads as artificial.

### Voice selection

Match voice to archetype tone, not gender or age:

- Energetic-Hormozi → high-energy male voice with natural rasp.
- Calm-but-firm-coach → mid-register voice with measured pacing.
- Contrarian-pointed → slightly nasal, sharper consonant attack.
- Warm-educator → soft attack, smiling tone.

Test the voice against the **first 5 words of the script** before committing to a 45s render — if those 5 words don't sell, the rest won't either.

## Caption design

YAP captions are the muted-scroll primary read. Reference the existing components in `src/lib/components/captions/`:

- **HormoziCaptions.tsx** — yellow fill on the active word, white surrounding words, heavy black stroke. The Hormozi/Codie default. Use for energetic and contrarian tones.
- **TikTokCaptions.tsx** — white fill, thick black stroke, no color highlight. Use for educator and coach tones (cleaner, less aggressive).
- **KaraokeCaptions.tsx** — solid color fill sweeps left-to-right across the active word. Use for music-bed-on videos because the sweep syncs visually with the bed.
- **MinimalCaptions.tsx** — clean sans-serif, single accent color, bottom-anchored. Use only if the headline is doing all the typographic work and you want the captions to recede.

### Cadence rules

- Word-by-word, not phrase-by-phrase. Pop each word at its Scribe-timestamped onset.
- Active word always 1.05x scale of inactive words (subtle pop, not bounce).
- Caption-block max two words on screen at once (for HormoziCaptions). Three-word blocks read as too much text in 9:16.
- Position: vertically centered or center-low. Never center-high (that's where the headline lived).

### Emoji injection

Inject emoji at ~1 per 5 seconds, on emphasis words only. NOT on every line. Heuristic: scan the VO script for the 5-8 emphasis words (the ones you'd bold in writing) and emoji those.

Examples:
- "money" → 💰
- "stop" → 🛑
- "growth" → 📈
- "wrong" → ❌
- "truth" → 👁️
- "save" → 💾 or 🏦
- "fast" → ⚡

Avoid: 😂 / 🥺 / 💯 — these read as TikTok-2022 and undercut the educational tone.

### Headline overlay (Remotion)

Spec for the 0-1s headline:

```tsx
<Sequence durationInFrames={30}>
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 240 }}>
    <h1 style={{
      fontFamily: 'Inter',
      fontWeight: 900,
      fontSize: 112,
      lineHeight: 1.0,
      color: '#fff',
      textShadow: '0 4px 24px rgba(0,0,0,0.6)',
      textAlign: 'center',
      maxWidth: 920,
    }}>
      Why your savings strategy is wrong
    </h1>
  </AbsoluteFill>
</Sequence>
```

Fade out the last 6 frames. The headline must be off-screen by frame 30 (1s @ 30fps). If it lingers, it competes with the captions.

For two-line headlines (patterns #2, #4, #6, #8, #9, #10), use a `<div>` wrapper with the small line at 56-72px and the large line at 112-128px, stacked. Keep `lineHeight: 1.0` and `letterSpacing: -0.02em` for the large line.

## 8 mistakes that kill the YAP read

1. **Jump cuts.** Even one. The single-shot discipline is non-negotiable. If the take is too long, re-cut the VO script.
2. **Headline that holds past 1s.** It steals attention from the captions and the face. Hard out by frame 30.
3. **Headline that's too long.** 4-9 words. 10+ words and the typographic mass collapses.
4. **Late captions.** If captions trail the audio by even 80ms it reads as broken. Use Scribe v1 word-timestamps, not whisper-1 — Scribe is sharper at word boundaries.
5. **Robotic VO smoothness.** stability ≥ 0.6 is the silent killer. Lower it.
6. **Multi-idea overload.** YAP punishes >1 idea. If the brief has two, refuse and route to `listicle`.
7. **B-roll inserts.** Every b-roll cut signals "this is a produced video." Resist.
8. **Cinema lighting.** Moody key + colored fill = ad. Window light only.

## 4 worked examples

### Example 1 — Business advice (Hormozi-style energetic)

**Headline (pattern #1):** "Why your pricing is wrong"

**Idea:** Founders price by cost-plus when they should price by value-perceived. Doubling the price often doesn't lose customers — it reframes the product as premium and the same buyers stay.

**Archetype + tone:** Entrepreneur, energetic-Hormozi.

**Keyframe prompt:**
> Phone-shot medium close-up of a 32-year-old man in a black short-sleeve crew-neck, modern home office with blurred bookshelf and laptop edge, soft window light from camera-left, lean-into-camera posture, alert wide-eyed conviction, hand at chest height entering frame, 28mm-equivalent lens character, flat broadcast-natural color, eyes locked on lens.

**i2v model:** `kwaivgi/kling-v3.0-pro`, 45s assembled from three 15s segments with crossfades at the segment boundaries (invisible at 30fps if the keyframe is identical).

**VO script (~110 words, 45s @ 2.5wps):**
> "Most founders price wrong. They take their cost, they add a margin, they call it a day. That's not pricing. That's accounting. Pricing is what the customer believes the thing is worth. Double your price tomorrow. Watch what happens. Half your customers don't notice. The other half take you more seriously. Because price is a signal. A cheap thing is a cheap thing. An expensive thing is a serious thing. You're not in the business of being cheap. You're in the business of being chosen. Raise your price. See who stays. Those are your real customers."

**ElevenLabs:** stability 0.30, similarity_boost 0.7, style 0.5 (lean energetic). Voice: high-energy male with natural rasp.

**Captions:** HormoziCaptions, yellow-fill on active word.

**Emoji injection points:** "wrong" → ❌, "double" → ⬆️, "expensive" → 💰, "chosen" → 🎯.

**Music:** none — dry. Reinforces the conviction read.

---

### Example 2 — Finance hot take (Codie-style contrarian)

**Headline (pattern #3):** "If you're saving 10% of your income, stop."

**Idea:** Saving 10% of a stagnant income compounds at the rate of inflation; it's a comforting habit but not a wealth-building strategy. The real lever is income growth, not savings rate.

**Archetype + tone:** Contrarian, contrarian-pointed.

**Keyframe prompt:**
> Phone-shot medium close-up of a 34-year-old woman in a charcoal blazer over a white tee, blurred warm-neutral interior with a single plant out of focus, soft window light camera-left, slight forward lean, single raised eyebrow, hand pointing toward lens on emphasis, eyes locked on camera, half-smile, 28mm-equivalent lens, flat color, broadcast-natural.

**i2v model:** `google/veo-3.1`, 45s single segment with native lip-sync (the emphasis words land harder when the mouth-shape matches).

**VO script (~105 words):**
> "If you're saving ten percent of your income, I need you to stop. Here's the math nobody runs. Ten percent of a stagnant salary, compounded at three percent inflation, makes you exactly as poor in twenty years as you are today. Saving is a discipline. It is not a strategy. The strategy is income. Find one skill that pays double. Sell it. Save fifty percent of the increase. That's wealth-building. The rest is a treadmill with good marketing. The savings industry sells you ten percent because ten percent keeps you in the game. It does not get you out."

**ElevenLabs:** stability 0.35, similarity_boost 0.75, style 0.45. Voice: mid-register female with sharp consonant attack.

**Captions:** HormoziCaptions but with a magenta active-word fill instead of yellow (signals contrarian, not bro-business).

**Emoji injection:** "stop" → 🛑, "math" → 🧮, "wealth" → 📈, "treadmill" → 🔄.

**Music:** optional minimal lo-fi loop at -24 LUFS, fades in at 5s.

---

### Example 3 — Productivity advice (calm coach)

**Headline (pattern #4):** "**2 minutes** of focus advice"

**Idea:** Most "focus" advice is about blocking distractions. The real lever is choosing one task important enough that distractions don't matter. Importance, not willpower.

**Archetype + tone:** Coach, calm-but-firm-coach.

**Keyframe prompt:**
> Phone-shot medium close-up of a 38-year-old man in a soft cream knit, bright minimal kitchen interior with morning light, plant in soft focus, settled torso, slow steady eye contact, hands occasionally folded at chest, voice-of-authority calm, 28mm-equivalent lens, flat color, no grade, broadcast-natural.

**i2v model:** `kwaivgi/kling-v3.0-pro`, 50s assembled from 5x10s clips.

**VO script (~120 words):**
> "Two minutes of focus advice. Most of what you've read about focus is wrong. The advice tells you to block apps, silence notifications, set timers. That's not focus. That's hygiene. Focus is when the task in front of you matters more than the things competing for your attention. If you keep getting distracted, the issue isn't your willpower. The issue is the task. The task isn't important enough. Find the one thing this week that, if you finished it, would change the next month. Sit with it. Don't block apps. Don't silence anything. Just notice — when the task is real, the distractions stop being interesting. Importance is the only focus tool that works."

**ElevenLabs:** stability 0.40, similarity_boost 0.7, style 0.35. Voice: warm mid-register male, smiling tone.

**Captions:** TikTokCaptions, white fill, no highlight color.

**Emoji injection:** "wrong" → ❌, "focus" → 🎯, "matters" → ⭐, "real" → 🔥.

**Music:** soft ambient pad at -26 LUFS throughout.

---

### Example 4 — Contrarian opinion (educator-style)

**Headline (pattern #2):** "THE TRUTH ABOUT compound interest"

**Idea:** Compound interest is real but the time horizons in retail finance content are misleading — most people compounding at 7% over 30 years still lose to a single salary doubling at year 5. Compounding rewards capital, not patience.

**Archetype + tone:** Educator, warm-educator (with a contrarian edge in content).

**Keyframe prompt:**
> Phone-shot medium close-up of a 30-year-old woman in a navy crew-neck, blurred home setting with framed art and bookshelf, soft window light camera-left, open posture, soft smile, occasional nod, easy eye contact, 28mm-equivalent lens, flat color, broadcast-natural — warm but precise.

**i2v model:** `google/veo-3.1` for the lip-sync (numbers in the script need clear mouth-shape sync).

**VO script (~115 words):**
> "The truth about compound interest. Yes, it works. No, it isn't going to make you rich. Run the math. Ten thousand dollars compounding at seven percent for thirty years becomes seventy-six thousand. That's not wealth. That's a used car in 2056. Meanwhile, doubling your salary in the next five years adds half a million in lifetime earnings, easily. Compound interest is a tool for capital. If you don't have capital, the lever isn't time, it's income. The retail finance industry teaches compounding because compounding flatters the small saver. It says, your patience matters. It says, time is on your side. Time is on the side of capital. Be capital first."

**ElevenLabs:** stability 0.35, similarity_boost 0.75, style 0.4. Voice: warm mid-register female, precise consonants.

**Captions:** HormoziCaptions with a teal active-word fill (educator-coded color, not yellow-bro).

**Emoji injection:** "truth" → 👁️, "math" → 🧮, "wealth" → 💰, "income" → 💵, "capital" → 🏦.

**Music:** none — the seriousness of the numbers reads better dry.

---

## CLI cookbook (copy-paste verbs)

```bash
# Generate the keyframe (with optional persona ref)
ralphy generate image \
  --model gemini-3-pro-image-preview \
  --prompt "$(cat keyframe-prompt.txt)" \
  --ref workspace/projects/<id>/assets/uploaded/persona.jpg \
  --project <id> --slot scene-01-keyframe

# Generate VO (single take)
ralphy generate voiceover \
  --voice <voice-id> \
  --script "$(cat vo.txt)" \
  --stability 0.35 --similarity-boost 0.7 --style 0.4 \
  --project <id> --slot vo-main

# Generate the talking-head clip (premium)
ralphy generate video \
  --model veo-3.1 \
  --keyframe workspace/projects/<id>/assets/scene-01-keyframe.png \
  --audio workspace/projects/<id>/assets/vo-main.mp3 \
  --duration 45 \
  --project <id> --slot scene-01-clip

# Generate the talking-head clip (budget — assemble from segments)
ralphy generate video \
  --model kling-v3.0-pro \
  --keyframe workspace/projects/<id>/assets/scene-01-keyframe.png \
  --duration 10 --segments 5 \
  --project <id> --slot scene-01-clip

# Render the final composition (Remotion picks up headline + captions automatically)
ralphy render <id>
```

If a verb above doesn't exist yet on `ralphy`, **stop** and propose adding it to `cli/commands/` rather than reaching for `bunx tsx` or raw API calls. AGENTS.md hard rule #2.
