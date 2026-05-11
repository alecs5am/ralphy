# Prompt cookbook — GRWM

Reusable building blocks and worked examples for `/ralph-art-director`. Combine fresh per project; don't paste verbatim. The whole format is built on the parallel-track scaffold below — every other recipe in this file plugs into it.

## Master template — parallel-track scaffold

GRWM is two tracks running at the same time. Author them as two parallel timelines and stitch in composition.

```
┌─ Visual track (jump-cuts every 4-7s) ───────────────────────────────────┐
│  beat-01  hook + first product    (3s)                                  │
│  beat-02  base / foundation       (5s)                                  │
│  beat-03  brows / eyes            (5s)                                  │
│  beat-04  lips / contour          (5s)                                  │
│  beat-05  hair                    (5s)                                  │
│  beat-06  outfit / accessory      (5s)                                  │
│  beat-07  final-look reveal       (5s)                                  │
│  beat-08  CTA / cliffhanger       (3s)                                  │
└─────────────────────────────────────────────────────────────────────────┘
┌─ Voice track (one continuous storytime) ───────────────────────────────┐
│  setup        →  tension       →  twist        →  punch        →  CTA  │
│  (0-10s)         (10-25s)         (25-45s)        (45-55s)       (55-)  │
└─────────────────────────────────────────────────────────────────────────┘
```

The cuts on the visual track do NOT have to match story beats. In fact they shouldn't — the layers are independent. The viewer's brain stitches them and that's the format's signature feel.

For a 30-45s video, drop beat-04 + beat-06 and shorten the story to setup → twist → punch.

## Beauty-shot prompt vocabulary

Reusable image-prompt fragments for `gemini-3-pro-image-preview`. Mix and match per beat.

### Close-up application
> "Extreme close-up of <character>'s <face area> as she applies <product> with <tool>. Hands clearly in frame, slight motion blur on the brush. Soft window-front warm light from camera-left. 9:16 vertical. Phone-camera realism, slightly handheld feel. Skin texture preserved — pores, fine hair, no plastic smoothing."

### Mirror reflection
> "Medium shot of <character> looking into a vanity mirror, her reflection visible in the mirror. She is mid-application, brush in hand. Bathroom or bedroom vanity environment, fairy lights or warm bulbs. Phone-camera angle from the side, viewer sees both her face and her reflection."

### Product hero shot
> "Close-up of <product> AS PER THE PROVIDED REFERENCE IMAGE — exact packaging, exact logo, exact color. Held in <character>'s hand, slightly tilted toward the camera, soft window light. Background blurred, vanity / bathroom environment. 1-1.5 second beat to register the brand."

### Final-look mirror reveal
> "Medium shot of <character> looking directly into the camera (selfie-mirror angle), full final makeup look on. Confident half-smile or neutral. Same lighting and environment as the opening beat for visual continuity. Outfit visible from chest up."

### Outfit-reveal walk-out
> "Wide shot of <character> walking out of the bedroom toward the camera, full outfit visible, final makeup on. Hallway or bedroom doorway. Natural light from behind, slight backlight. She gives a small wave or smirk."

### Lighting default
> "Window-front warm natural light, camera-left or camera-front. Slight golden hour bias. Avoid: studio strobes, ring-light hot-spots, blue cool LEDs (read as fake-creator)."

## Jump-cut pacing

Hard cut every **4-7 seconds**. Never linger on one beat past 8s. The exception is the final-look reveal — it can hold for 4-5s as a payoff.

When in doubt, cut earlier. The format's energy comes from the rhythm.

In Remotion, set each `<Sequence>` to start exactly where the previous one ends — no fade, no crossfade between makeup beats. A direct cut is the GRWM signature. Crossfade is reserved for the hook→base transition (optional, 6 frames) and final-look→CTA (optional, 8 frames).

## Voiceover settings

Single conversational track, ElevenLabs `eleven_multilingual_v2`. The whole story runs underneath the visual track without break.

```
voice_settings: {
  stability: 0.4,           // conversational warmth, slightly variable
  similarity_boost: 0.75,   // the creator's voice, not a robot read
  style: 0.30,              // moderate emotional shading
  use_speaker_boost: true
}
```

If the take comes back too smooth and "podcast-y", lower stability to 0.35. If it comes back too unhinged, raise to 0.45. Above 0.5 the warmth dies.

For storytime-heavy hooks (patterns #2, #3, #11 in `hooks.md`), the VO should sound like talking to a single friend — not performing. Tell the model the line is "spoken to one person on the other side of the bathroom mirror".

If music is in play, dip it to **-20 dB under VO** in composition. The story is the conversion driver; never let the bed compete.

## Captions

Pick one per project; do not split mid-video like in `before-after-product`.

- **Hormozi-yellow** (default for high-energy storytime) — large, yellow + black outline, kinetic. For hot-takes, gossip, confessional.
- **MinimalCaptions, bottom-third** (calmer vlog tone) — small, white, no outline. For corporate GRWM, advice, lifestyle vlog.

Use OpenRouter `whisper-1` for transcription, then style in the Remotion composition. Do not let captions cover the makeup work — keep them in the bottom-third for any beat where the face is the subject.

## Music

**Optional** — many GRWMs run VO + ambient room tone only, which is the most native sound. Add music only if the story is light and you need additional energy.

Recommended bed:
> "Low-energy lifestyle ambient instrumental, lo-fi soft pop or indie acoustic, 75-90 BPM, no vocals, no melody hooks that compete with VO. Light reverb. 60-90 second loop."

Mix: **-18 to -22 dB under VO**. If you can clearly hear the melody when the VO is speaking, it's too loud.

Cross-fade music in over the first 1.5s and out over the last 2s. Hard music cuts on a GRWM read as amateur edits.

## 8 mistakes (and the fix)

1. **No story to tell — just a product reel.** Fix: scrap the project or pivot to `before-after-product`. GRWM without a narrative track underperforms by 40-60% on completion. The whole format is the dual-layer.
2. **No jump cuts — long lingering takes.** Fix: enforce the 4-7s cut cadence in composition. Re-cut clips to be shorter; if a clip can't survive a cut at 5s, regenerate.
3. **Final reveal weak.** Fix: shoot the final-look beat with the *same lighting and angle* as the opening beat. The visual rhyme is what makes the reveal land.
4. **Product not branded clearly.** Fix: the product hero shot needs the user-supplied reference passed into `--ref` for `gemini-3-pro-image-preview`. Without the reference, the model invents packaging every time and it reads as fake.
5. **VO narrates the makeup.** Fix: rewrite. The voice should NEVER say "now I'm applying foundation". The voice runs an independent storyline. The independence is the format.
6. **Character drifts between cuts.** Fix: pass a character reference to every keyframe call. Without it, gemini-3-pro will drift across 8+ jump-cuts and the look reads as "three different women putting on makeup".
7. **Hook only fires one layer.** Fix: rewrite the first 3 seconds. The hook must contain BOTH a story tease AND a visual that establishes the getting-ready frame. See `hooks.md` for 12 patterns.
8. **Music drowns the VO.** Fix: dip the bed to -20 dB. If you can hear the melody clearly under the VO, it's too loud. The story is the conversion driver, not the music.

## Worked examples

Four end-to-end starting points. Each is a *vibe sketch* — the user adapts it to their own brief.

### Example 1 — Beauty GRWM (date night)

```
Occasion: first date, 7pm dinner reservation
Niche: beauty, native placement (Rare Beauty blush)
Reference: Rare Beauty Soft Pinch blush packaging photo (REQUIRED)
Hook: pattern #3 — "Strangest date of my life…"
Final reveal: mirror selfie + cliffhanger ("part 2 tomorrow")

Visual track:
  beat-01  hook — first base swipe in mirror               (3s)
  beat-02  foundation buffing close-up                     (5s)
  beat-03  brow gel + concealer                            (5s)
  beat-04  RARE BEAUTY blush — product hero + application  (6s)
  beat-05  lip stain                                        (5s)
  beat-06  hair tousle                                      (5s)
  beat-07  outfit — black slip dress                        (5s)
  beat-08  mirror reveal + cliffhanger                      (4s)
                                                  total ~38s

Voice track:
  setup    "Today I'm having the strangest date of my life…"
  tension  "He picked the restaurant, fine. He said he had a surprise, also fine."
  twist    "And then his MOM texted me. Yeah. His mom."
  punch    "Anyway, this Rare Beauty blush is doing all the work tonight."
  CTA      "Part 2 tomorrow when I tell you what she said."

Music: lo-fi indie acoustic, dipped -20dB.
Captions: Hormozi-yellow (high-energy gossip).
```

### Example 2 — Corporate GRWM (investor meeting)

```
Occasion: pitch meeting with a Series A lead investor, 10am
Niche: corporate / advice
Reference: not required (no named brand) — character ref strongly recommended
Hook: pattern #8 — "GRWM for the meeting where I'm asking for a 30% raise."
Final reveal: walk-out toward laptop on desk

Visual track:
  beat-01  hook — coffee + first product                   (3s)
  beat-02  no-makeup-makeup base                            (6s)
  beat-03  brows + minimal eye                              (5s)
  beat-04  neutral lip                                      (5s)
  beat-05  hair into low pony                               (5s)
  beat-06  blazer + button-up                               (6s)
  beat-07  walk to desk, sit, open laptop                   (5s)
                                                  total ~35s

Voice track:
  setup    "GRWM for the meeting where I'm asking for a 30% raise."
  tension  "I prepped the deck three times. I rehearsed with my manager."
  twist    "And I realized: I've been undercharging for two years."
  punch    "The number I'm asking for is fair. Not aggressive — fair."
  CTA      "If you're prepping for one of these — what I learned in comments."

Music: none — VO + room tone only (corporate-appropriate).
Captions: MinimalCaptions, bottom-third (advice tone).
```

### Example 3 — Gym GRWM (post-workout)

```
Occasion: after a 6am lift, getting ready for the day
Niche: fitness / lifestyle
Reference: not required — character ref recommended
Hook: pattern #5 — "I have 25 minutes before standup and I just finished deadlifting."
Final reveal: outfit-reveal walk-out

Visual track:
  beat-01  hook — gym hallway, sweaty, water bottle         (3s)
  beat-02  cold rinse / cleanser at the gym sink            (5s)
  beat-03  moisturizer + SPF                                (5s)
  beat-04  tinted balm + cream blush                        (5s)
  beat-05  hair into messy bun                              (5s)
  beat-06  swap gym fit for jeans + sweater                 (5s)
  beat-07  walk-out toward the parking lot                  (4s)
                                                  total ~32s

Voice track:
  setup    "I have 25 minutes before standup and I just finished deadlifting."
  tension  "And no, I don't shower at the gym — I tried it twice, it's a war crime."
  twist    "But I do this whole skincare reset at the sink and somehow look human."
  punch    "Mostly because nobody on Zoom can smell me."
  CTA      "Drop a comment if you want the full 5-minute reset routine."

Music: light indie pop bed, dipped -22dB.
Captions: Hormozi-yellow (energy + gym audience).
```

### Example 4 — Wedding-guest GRWM (formal event)

```
Occasion: best friend's wedding, 4pm ceremony
Niche: lifestyle / fashion
Reference: not required — character + dress ref recommended
Hook: pattern #2 — "Today I'm getting ready for my best friend's wedding, so let me tell you why I'm not bringing my boyfriend."
Final reveal: full outfit, dress + heels, walk to car

Visual track:
  beat-01  hook — dress on hanger, first base swipe         (3s)
  beat-02  fuller-coverage foundation                       (6s)
  beat-03  bronzer + blush + highlight                      (6s)
  beat-04  smoked-out brown eye                             (6s)
  beat-05  matte rose lip                                   (5s)
  beat-06  hair into a sleek low chignon                    (6s)
  beat-07  step into dress + heels                          (6s)
  beat-08  full reveal + walk to car                        (5s)
                                                  total ~43s

Voice track:
  setup    "Today I'm getting ready for my best friend's wedding…"
  tension  "And no, I'm not bringing my boyfriend. He met her once."
  twist    "And he said — and I'm quoting — 'she seems like a lot.'"
  punch    "She's the maid of honor at my wedding next year. So."
  CTA      "Tell me I'm right in comments."

Music: soft acoustic guitar bed, dipped -20dB.
Captions: Hormozi-yellow (gossip / confessional).
```

## Negative prompt

For every keyframe call:

> "no plastic skin, no airbrushed look, no studio strobe lighting, no ring-light hot-spots, no glamour-magazine retouching, no fake brand, no logo distortion, no AI-improvised packaging, no hands with extra fingers, no character drift between frames."

## Reference-required prompt addendum

Whenever a user-supplied product reference is in the call, append:

> "Product appears AS PER THE PROVIDED REFERENCE IMAGE — exact packaging, exact logo, exact color. Do NOT improvise branding."

Whenever a user-supplied character reference is in the call, append:

> "Character is the SAME PERSON as in the provided reference image — same face, same features, same skin tone, same hair color. Do NOT drift across frames."

Pass the references into `--ref` for every relevant frame. The dual-layer collapses if either the product or the character reads as fake.
