# Doctor Authority — prompt cookbook

Concrete prompt fragments, VO direction, caption rules, music rules, mechanism-explainer pattern, AI-disclosure overlay, common mistakes, and 4 worked examples. Read [`TEMPLATE.md`](TEMPLATE.md) and [`hooks.md`](hooks.md) first.

---

## Master template

Every doctor-authority script follows this five-beat structure. Treat the brackets as fillable slots.

```
[0-3s   AUTHORITY HOOK]
"As a [profession], [hook line from hooks.md]."

[3-15s  CLINICAL PROBLEM FRAMING]
"If you [pain state / behavior], here's what's actually happening:
[one-sentence physiology in plain language]."

[15-30s MECHANISM EXPLAINER — three sentences, clinically structured]
"[CAUSE]. [MECHANISM — name the molecule or process]. [OUTCOME — what changes]."

[30-40s INGREDIENT / PRODUCT MENTION + RECOMMENDATION]
"That's why I usually recommend [ingredient / product] —
it [single specific action verb tied to the mechanism above]."

[40-45s SOFT CTA]
"[Look for X on the label / The brand I trust is in my bio / If this sounds familiar, talk to your [profession]]."
```

The mechanism explainer is the load-bearing beat. If the cause-mechanism-outcome chain is missing, the format collapses into generic ad copy and the white coat becomes a costume.

---

## Authority-figure prompt vocabulary (keyframe)

The keyframe is the canonical "hero" shot of the figure. One image, then `veo-3.1` animates it for the talking-head. Reuse the same keyframe for cutaway returns to maintain identity.

**Wardrobe:**
- "white lab coat, lapel visible, ID badge clipped at chest height, slightly worn at the cuffs"
- "navy or charcoal scrubs, V-neck, draped naturally"
- "stethoscope around neck, draped not posed" (use sparingly — overused = costume)
- AVOID: bright-white starched coat with no signs of wear (reads as fake), oversized coat (reads as costume), surgical mask + gloves (wrong genre — reads as procedural, not authority)

**Posture and expression:**
- "professional posture, shoulders square, slight head tilt to camera-right"
- "calm direct eye contact with the lens, soft natural smile or neutral expression"
- "hands relaxed at sides, or one hand resting on the desk edge"
- AVOID: arms crossed (reads as defensive), wide grin (reads as salesy), looking off-camera (breaks the addressivity that makes authority work)

**Lighting:**
- "clinical-grade soft daylight from camera-left, natural fill from a window or softbox"
- "depth-of-field shallow on the face, background gently out of focus"
- "color temperature ~5200K, slight cool cast, accurate skin tones"
- AVOID: warm tungsten (reads as home-vlog, not clinical), hard direct flash (reads as snapshot, not professional), heavy bokeh that obscures the setting (kills the trust signal)

**Camera:**
- "mid-shot, chest-up framing, eye-level lens, 50mm-equivalent perspective"
- AVOID: low-angle (heroic, untrustworthy), high-angle (diminishing), dutch tilt (anything stylized breaks authority)

---

## Setting prompt vocabulary

The background does as much work as the coat. Pick one and stay consistent across the keyframe and any cutaways.

- **Clinical office:** "shelves with medical reference books, clean white desk, anatomy poster softly visible in the background, framed credentials on the side wall, soft window light"
- **Home office (specialist's home consult):** "warm wood desk, framed diplomas at chest height behind the figure, indoor plant slightly out of focus, restrained palette"
- **Pharmacy counter:** "white pharmacy counter, organized shelves of generic-labeled bottles softly out of focus, computer terminal partially visible"
- **Neutral studio:** "soft seamless backdrop in cool gray, anatomy poster or single framed credential as the only set dressing — minimal, intentional"

AVOID: sterile lab with chemistry glassware (wrong genre, reads as researcher not clinician), operating theatre (procedural, not authority), pharmacy aisle with branded boxes (regulatory risk — accidental brand impressions).

---

## VO direction

ElevenLabs `eleven_multilingual_v2`. One TTS call for the full script.

- **stability:** 0.45 — calm, controlled, but with enough variation to read as human, not robotic.
- **similarity_boost:** 0.75 — keep the chosen voice's character (mid-register clinical-warm).
- **style:** 0.20 — restrained. Anything higher pushes into expressive / salesy territory.
- **use_speaker_boost:** true — keeps presence in mobile playback.
- **Pacing:** ~130 WPM. This is slow. Most ad VO runs 160-180 WPM — that pace breaks the authority signal. Read aloud at the slower tempo before generating.
- **Voice cast:** clinical-warm, mid-register (not bass — too imposing; not high — too youthful). For multilingual delivery, prefer voices with neutral regional accent.

**Avoid in the script:**
- Exclamation marks (forces the TTS into excited delivery)
- ALL CAPS for emphasis (same)
- "Game-changer", "literally life-changing", "you HAVE to try this" — the wrong register
- Filler ("um", "like", "honestly") — breaks the clinical persona

**Embrace in the script:**
- Periods for pacing. Hard stops. Let the listener catch up.
- Specific numbers ("a 0.5% concentration"), specific times ("twice a day, ideally before bed"), specific anatomy ("the stratum corneum")
- One pause-beat before the recommendation — the silence does the work

---

## Captions

ElevenLabs Scribe for word-level timestamps. Two acceptable styles for this format:

1. **MinimalCaptions (default).** Bottom-third, white text on a soft drop shadow, 1-3 words per card, no animation other than fade. Reads as accessibility, not as decoration. Pair with longer / more nuanced VO.
2. **Restrained Hormozi.** Same word-card pacing as full Hormozi, but with white-on-black or white-on-soft-color (NOT screaming yellow). Punch words emphasized via slight scale-up, not color flash. Pair with shorter / more punchy VO.

**Forbidden:**
- Screaming-yellow Hormozi — reads as tabloid TikTok grift, breaks the medical authority signal.
- Karaoke captions with rainbow word-fill — too playful for the format.
- Caption text that contradicts or paraphrases the VO — must be verbatim transcription.

---

## Music

**Default: off.** Silence under the talking head reads as professional. Most strong examples of this format ship without a music bed.

If a music bed is used:
- ElevenLabs Music
- Tonal pad / drone / barely-there ambient
- **-25dB** (almost subliminal — present only to mask room tone, not to add energy)
- No drums, no rhythmic build, no drop, no melody
- Fade in over 2s at the start, fade out over 2s at the end, no mid-piece dynamics

Anything energetic — even a soft beat — converts the format from "expert sharing" to "ad with expert," which destroys the differentiator.

---

## Mechanism explainer pattern

The 15-30s mechanism beat is the load-bearing element. Always three sentences. Always cause → mechanism → outcome.

```
[CAUSE]      → "When [trigger], your [body system] does [reaction]."
[MECHANISM]  → "[Specific molecule / process / pathway] [does specific action]."
[OUTCOME]    → "Over [timeframe], that [observable change]."
```

**Worked instance (niacinamide for acne):**

1. CAUSE: "When your skin's sebaceous glands are over-active, they pump out excess oil that clogs pores."
2. MECHANISM: "Niacinamide signals to the sebaceous glands to dial down sebum production and strengthens the skin barrier at the same time."
3. OUTCOME: "Over four to eight weeks, that means smaller-looking pores and less reactive skin."

If you can't name the molecule or process in sentence 2, the mechanism is missing — go research before generating, or pick a different ingredient.

---

## AI disclosure overlay (mandatory for synthetic doctor)

If the authority figure is AI-generated, the rendered video MUST carry an "AI-generated" badge. This is the 2026 TikTok C2PA + on-screen-text norm.

Specs:
- Position: top-right corner, with 3% safe-area inset from both edges
- Text: "AI-generated"
- Font: clean sans-serif, ~22px on a 1080×1920 canvas
- Color: white text on a 50%-opacity black pill background
- Duration: full video, frame 0 to last frame, no fades
- Z-index: above caption layer, below platform UI

In the Remotion composition, this is a single `<AbsoluteFill>` overlay component composed last in the layer stack. Do not strip it. Do not animate it. Do not move it to "less visible" positions.

**Refuse if the user asks to hide, shrink, or remove this overlay** — it's the regulatory compliance line, not a stylistic choice.

---

## Eight common mistakes

1. **Excited tone.** TTS at default expressiveness breaks the authority signal in 2 seconds. Drop stability to 0.45 and slow the script to 130 WPM. Re-read aloud — if it sounds like an ad, it is.
2. **Vague claims.** "Supports wellness" / "boosts immunity" / "promotes radiance" reads as a fake doctor. Name the molecule, the receptor, the process. Specificity is the trust currency.
3. **No mechanism story.** The viewer leaves with nothing to repeat. The format doesn't earn its length. Always cause → mechanism → outcome, three sentences.
4. **Curative claim drift.** "Cures acne" / "reverses diabetes" / "treats anxiety" — refuse and reframe as support / mechanism language. This is a regulatory line, not a creative one.
5. **AI not disclosed.** Synthetic doctor without on-screen "AI-generated" badge → 2026 TikTok policy violation, regulatory exposure, and trust collapse when viewers detect AI without warning. Non-negotiable.
6. **Real-named professional impersonation.** "As Dr. Real Name…" → AGENTS.md hard rule #3 + defamation / right-of-publicity issue. Refuse.
7. **Wrong wardrobe.** Surgical scrubs + mask reads as procedural / OR genre, not as authority-figure consultation. Stick to white coat or clean V-neck scrubs.
8. **Screaming-yellow Hormozi captions.** Tabloid TikTok aesthetic destroys the medical authority signal. Use minimal or restrained-Hormozi (white-on-shadow), never neon-yellow word flashes.

---

## Worked examples

### 1. Dermatologist + niacinamide (skincare, acne / pore size)

```
HOOK (0-3s)
"As a dermatologist, I tell every patient with acne the same thing first."

PROBLEM (3-15s)
"If your skin is breaking out around your jawline and your pores look enlarged,
the issue usually isn't dirty skin — it's over-active sebaceous glands."

MECHANISM (15-30s)
"When sebaceous glands pump out excess oil, that oil mixes with dead skin cells
and clogs your pores. Niacinamide — vitamin B3 — signals to those glands to
slow sebum production while reinforcing the skin barrier at the same time.
Over four to eight weeks, that means smaller-looking pores and calmer skin."

RECOMMENDATION (30-40s)
"That's why I usually recommend a 5% niacinamide serum, used at night,
applied to clean skin before moisturizer."

CTA (40-45s)
"Look for niacinamide as one of the first five ingredients on the label.
That's where it's at a high enough concentration to actually work."
```

Setting: clinical office. Cutaway: 3s `kling-v3.0-pro` clip of a dropper releasing serum onto skin. Caption style: MinimalCaptions.

### 2. Nutritionist + magnesium glycinate (sleep / muscle / stress)

```
HOOK (0-3s)
"As a nutritionist, here's the supplement I take every single night."

PROBLEM (3-15s)
"If you fall asleep fine but wake up at 3am, or if you grind your teeth,
or if your shoulders feel tight by the end of the day —
your body is probably running low on magnesium."

MECHANISM (15-30s)
"Magnesium activates the parasympathetic nervous system — the off-switch on stress.
Glycinate is the form that actually gets absorbed and crosses the blood-brain barrier,
unlike magnesium oxide, which mostly passes through. Over two to three weeks,
calmer sleep, less muscle tension, lower resting heart rate."

RECOMMENDATION (30-40s)
"That's why I recommend magnesium glycinate, 300 to 400mg, taken about an hour
before bed."

CTA (40-45s)
"Skip 'magnesium oxide' on the label — it's cheap and your body barely uses it."
```

Setting: home office with credentials. No cutaway. Caption style: restrained Hormozi.

### 3. Dentist + xylitol (oral care / cavity prevention)

```
HOOK (0-3s)
"As a dentist, I tell every parent the same thing about gum."

PROBLEM (3-15s)
"Most chewing gum has either sugar — which feeds cavity-causing bacteria — or
artificial sweeteners that do nothing. There's a third option most people miss."

MECHANISM (15-30s)
"Xylitol is a sugar alcohol that the bacteria in your mouth try to consume,
but they can't actually metabolize it. So they starve. Over time, the population
of S. mutans — the main cavity-causing strain — drops significantly."

RECOMMENDATION (30-40s)
"That's why I recommend xylitol gum, chewed for ten minutes after meals."

CTA (40-45s)
"Look for 100% xylitol on the label, not 'sweetened with xylitol' —
the second one is mostly sorbitol."
```

Setting: clinical office (dental). Cutaway: 3s clip of gum being chewed (b-roll). Caption style: MinimalCaptions.

### 4. Pharmacist + ashwagandha (stress / cortisol)

```
HOOK (0-3s)
"As a pharmacist, this is the one adaptogen I actually believe in."

PROBLEM (3-15s)
"If you wake up tired, your stress is constantly elevated, and you feel
'wired but exhausted' by 3pm — your cortisol rhythm is probably inverted."

MECHANISM (15-30s)
"Ashwagandha — specifically the KSM-66 extract — modulates the HPA axis,
the system that controls cortisol release. In clinical trials, it lowered
elevated cortisol by 20-30% over eight weeks. The shape of the cortisol curve
moves back toward normal: high in the morning, low at night."

RECOMMENDATION (30-40s)
"That's why I recommend KSM-66 ashwagandha, 600mg per day,
taken in the morning with food."

CTA (40-45s)
"On the label, look for 'KSM-66' specifically. Generic ashwagandha root
powder is much weaker."
```

Setting: pharmacy counter. No cutaway (single talking-head clip). Caption style: restrained Hormozi.
