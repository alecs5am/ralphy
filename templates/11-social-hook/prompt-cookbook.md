# prompt-cookbook.md — generating hook assets

> How to translate a chosen hook pattern (from `hooks.md`) into Gemini 3 Pro keyframe prompts, Kling i2v prompts, optional ElevenLabs VO, and a music+SFX bed. Patterns are reusable; the copy and visuals are not.

## Master template (paste, then fill the brackets)

```
[FRAME 0 — the thumbnail frame, optimize this one ruthlessly]
9:16 vertical, 1080×1920. <ONE primary visual stimulus that violates a
viewer expectation>. Composition: <subject placement>. Lighting:
<high-contrast / soft-cute / harsh-tabloid / neon>. Color palette:
<3 specific colors>. Camera: <tight close-up / wide / dutch / eye-level>.
The frame must communicate "something is happening here" with sound off.

[FRAME 1 — at the curiosity-build beat (0.7-1.0s)]
Same scene, advanced: <what changes — text appears, scale shifts,
focus pulls, second character enters>. The change must be visible at
phone-thumbnail size.

[FRAME 2 — optional, at the commitment moment (1.5-2.0s)]
The partial-payoff frame. <Reveal 60% of the answer the hook posed.
Withhold the rest.>

[I2V CLIP 1 — frame 0 → frame 1, 5s, Kling v3.0 Pro, no audio]
Motion: <single dominant motion verb — pull-back / push-in / whip-pan
/ freeze / glitch / focus-shift>. Speed curve: <linear / accelerating
/ deccelerating / freeze-then-ramp>. Avoid: <handheld jitter, generic
slow-pan, multiple competing motions>.

[I2V CLIP 2 — optional, frame 1 → frame 2, 5s, Kling v3.0 Pro]
<Same fields as clip 1.>

[VO — optional, ElevenLabs multilingual v2]
Lines (max 12 words total for a 6s hook, 25 for 10s):
"<line 1, lands at 0.5-1.0s>"
"<optional line 2, lands at 1.5-2.0s>"
Voice settings: stability <0.4-0.6 — lower for raw, higher for measured>,
similarity <0.7+>, style <0.3-0.5>. Tone: <conversational / conspiratorial
/ deadpan / urgent>. Never corporate.

[MUSIC + SFX — ElevenLabs Music + library SFX]
Music brief: <one sentence — genre, BPM band, mood, where the hit lands>.
Hard hit at: <timestamp matching the commitment moment>.
SFX layer: <one or two — bass-thump, whoosh, record-scratch, notif-ding,
glass-shatter, vinyl-stop>. Lands at: <timestamp>.
```

## The first-3-second framework (apply per generation)

Every hook output is graded against four checkpoints. If it fails any, regenerate.

| Checkpoint | Pass criterion | Common failure |
|---|---|---|
| 0.0s frame | Eye lands on one anomaly within 200ms with sound off | Generic "person looks at camera" — no anomaly |
| 0.3-0.7s | First text overlay or first sound stab has landed | Silent ambient, text fades in at 1s+ |
| 1.5s | Curiosity gap is open (a question without an answer) | Reveal happened too early, no reason to keep watching |
| 3.0s | Commitment moment delivered partial payoff | Still setting up, viewer has scrolled |

Bake these as explicit timestamp comments in the keyframe prompt — Gemini honors them when they're written as cues, not just descriptions.

## Pattern-interrupt vocabulary (use these verbs in i2v prompts)

Verbs Kling renders cleanly:
- **whip-pan** — fast horizontal camera motion, sells "did you see that?"
- **dolly-snap** — sudden push-in on subject, used for emphasis
- **focus-rack** — depth-of-field shift from FG to BG (or back)
- **freeze-then-ramp** — full stop, then 2-4× speed
- **counter-rotate** — subject and camera rotate in opposite directions
- **whip-zoom** — combined whip-pan + zoom, for chaotic energy

Verbs Kling fumbles (avoid or compensate with longer prompt):
- "glitch" — too vague; specify pixel-displacement / chromatic-aberration / frame-tear
- "transformation" — too narrative; use "morph" or "dissolve at edges"
- "speed up" — specify "accelerate from 1× to 4× over 0.4s"
- "shaky cam" — Kling adds nausea, not energy; add "stabilized handheld" instead

## Sound design — grabbing attention sonically

Sound is 50% of the impact and the first thing that should hit the viewer. Audio must start ≤0.5s. The TikTok scroll is muted ~30% of the time, but among those who unmute, sound determines completion.

### The five sonic openers

1. **Bass-thump open.** A single sub-bass hit at 0.0s, then silence, then music kicks in at 1s. Used by half of TikTok's top videos.
2. **Whoosh-into-stab.** Whoosh ramps 0.0-0.3s, hits a synth/percussion stab at 0.3s, music underneath from 0.3s onward.
3. **Voice cold-open.** Spoken word at 0.0s with no music. First three words ARE the hook. Music joins at 1.5-2s.
4. **Strategic silence.** 0.0-0.5s is dead silent (rare, risky). At 0.5s, sudden loud SFX. Only works if the visual is shocking enough to hold the eye through 0.5s of silence.
5. **ASMR cold-open.** Intimate close-mic'd sound (cutting, tapping, whispering) from 0.0s. Best for satisfying / cute / curiosity hooks.

### SFX library cheatsheet (specify these by name in the brief)

- **Riser + downer** (1-2s ramp) — tension into a beat drop
- **Bass-808 stab** — for visual-shock pattern interrupts
- **Vinyl record-scratch** — pairs with freeze-frame breaks
- **Notification ding** — pairs with impossible-physics beats
- **Glass-shatter / metallic clang** — pairs with smash-cuts
- **Cinematic boom** — pairs with reveal moments at 2s+
- **Whisper / breath / lip-smack** — for ASMR or intimate hooks

### Music brief (for ElevenLabs Music)

Default 6s hook brief:
> "120-140 BPM, 6 seconds, [genre]. Tense buildup 0-1.5s, hard hit at 1.5s, sustained energy through 6s. Mix sits under voice. No vocal hooks (we have a VO)."

Default 12s hook+payoff brief:
> "[BPM] BPM, 12 seconds, [genre]. Tension 0-2s, drop at 2s, breakdown 6-8s, second hit at 8s, sustain to end. Two energy tiers."

Always specify the hit timestamp — that's the frame where image, motion, music, and (if present) text overlay all collide.

## 8 mistakes (and the fix)

1. **Stacking three pattern interrupts in 1 second.** Glitch + whip-zoom + bass-stab + text-pop = noise. Pick one. → Cut to one primary stimulus.
2. **The talking-head cold-open.** "Hey guys, today I want to talk about…" loses 80% by 2s. → Replace with the visual *of* what they want to talk about, VO joins later.
3. **Silence in the first 0.5s.** Reads as a buffering video. Algorithm interprets the dead zone as a fail. → Audio must start ≤0.5s.
4. **Tiny low-contrast text.** Mobile screen, bright environment, 0.5s reading window. → Sans-serif, bold weight, ≥120px, white-on-dark or black-on-yellow.
5. **The hook delivers nothing for 5+ seconds.** Means the actual hook is at 5s and the first 5s is wasted setup. → Cut everything before the real hook. The hook IS the open.
6. **Trending-audio mismatch.** Sad story over happy K-pop = whiplash, scroll. → Audio mood must match emotional valence of the visual.
7. **Cliché overlay text.** "WAIT FOR IT" / "POV:" / "Tell me you ___ without telling me" / "If you know, you know" — burned out by 2024. → Write fresh. If you can't, drop the overlay entirely.
8. **The false-promise hook.** Hook teases impossible physics, payoff is a 20s talking-head explanation. → Deliver on the visual promise within 5s, or pick a different hook.

## Worked examples

### Example A — Visual-shock + curiosity-gap, 8s, silent+SFX

Pattern: #2 (impossible physics) + #8 (half-reveal). Subject: home cooking. Voice: none.

```
FRAME 0 (0.0s): Tight overhead 9:16 of a wooden cutting board. Hands
holding a chef's knife above a tomato. Soft window light from frame-left.
Color palette: walnut brown, tomato red, dawn cream. The hands are
mid-cut motion — frozen pre-strike.

FRAME 1 (1.2s): Same overhead. The knife is mid-air, motionless. The
tomato has separated into eight perfect wedges *before the knife touched
it*. The wedges hover 2cm above the board. Knife still hasn't moved.

I2V CLIP 1 (0-5s, Kling): Hold on FRAME 0 for 1s. At 1s, the tomato
silently separates while the knife stays frozen mid-air. Camera
imperceptibly pushes in 5%. No handheld. Speed curve: linear, then a
0.2s freeze at the moment of separation.

I2V CLIP 2 (5-8s): The knife finally lowers and gently taps the
already-separated wedges, which scatter naturally across the board.
Wide enough to see a hand-written index card pinned to the wall behind:
"day 12".

SFX: 0.0s soft kitchen ambient (knife handle creak). 1.2s sudden
silence (3 frames, ~0.1s). 1.3s single soft chime. 1.4s ambient resumes.
Music: none, or low ambient drone under at -20dB.

TEXT OVERLAY: none in first 3s. At 5.5s, small bottom text: "day 12".
```

Why it works: Pattern #2 (impossible physics — tomato cuts itself) opens curiosity. Pattern #8 (half-reveal — what is "day 12" referring to?) keeps it open past 3s.

### Example B — Skeptic + after-first, 12s, voice-led

Pattern: #6 (skeptic) + #9 (after-first tease). Subject: productivity tool. Voice: VO.

```
FRAME 0 (0.0s): Person at a clean desk, late afternoon light, laptop
open showing a calendar with every slot in green. Person leans back,
arms crossed, mild smile. Eye contact with camera.

FRAME 1 (1.5s): Same person, same desk, but at 1.5s a hard cut to:
same person three days earlier — same desk, but visibly chaotic, sticky
notes everywhere, three open laptops, dim light, hair messy.

I2V CLIP 1 (0-5s): Static-ish frame 0 — person breathes, blinks, very
slight head turn. At 1.5s, smash-cut into the chaotic frame. Hold
2.5s. End on the person dragging hands down face.

I2V CLIP 2 (5-10s): Tight shots of the chaotic state — sticky notes,
overflowing inbox, phone notifications stacking. Each cut ~1s.

VO (ElevenLabs multilingual v2, conversational, slightly tired):
0.4-1.4s: "Look. I called this app a scam for six months."
1.6-3.0s: "Then I had this week."
6.0-8.0s: "Forty-three meetings. Two demos. Zero free time."

SFX: 0.0s soft room tone. 1.5s sharp glass clink at the cut. 6.0s
phone notification chime under VO.

MUSIC: ElevenLabs Music brief — "100 BPM, 12s, sparse lo-fi. Empty
0-1.5s. Tense pad enters at 1.5s, builds to 6s. Soft resolve 10s-12s."

TEXT OVERLAY: 0.5s "I was wrong." (small, bottom-left, sans-serif).
6.0s "43 meetings." (HormoziCaptions style, large, yellow on black).
```

Why it works: Pattern #6 (skeptic admission) disarms defensiveness in line 1. Pattern #9 (after-first cut) reveals consequence at 1.5s — viewer commits because they want to see how chaos became calm.

### Example C — Direct-question + visible-fail, 6s, controversial

Pattern: #7 (direct question) + #12 (visible fail). Subject: parenting fail / relatable. Voice: direct VO.

```
FRAME 0 (0.0s): Eye-level close-up. Person standing in a kitchen,
flour on their face, eyebrow raised. Behind them, slightly out of focus,
a toddler is calmly emptying an entire cereal box onto the floor.

FRAME 1 (2.5s): Pull-back slightly. Now visible: the dishwasher is
open and full of stuffed animals.

I2V CLIP 1 (0-5s): Static on FRAME 0 for 1.5s. Slow pull-back from 1.5s
to 4s revealing the dishwasher. Subject keeps eye contact through.

VO (ElevenLabs, deadpan, slightly amused):
0.3-1.5s: "Be honest. What would YOU have done?"
4.0-5.0s: "I just stood there."

SFX: 0.0s kitchen ambient. 1.0s soft toddler giggle (off-camera, subtle).
4.0s dishwasher beep.

MUSIC: 6s, 90 BPM, light comedic ukulele or muted piano, no drop.
Stays underneath VO at -15dB.

TEXT OVERLAY: 0.5s "be honest." (lowercase, white sans, small, center).
None after.
```

Why it works: Pattern #7 (direct question at 0.5s) forces internal answer. Pattern #12 (visible fail in the same frame) is the answer they're forming about. Pull-back at 1.5s adds a third surprise (dishwasher) — extends curiosity past 3s.
