# Prompt cookbook — fit-check

The exact prompts, motion vocab, beat-sync rules, brand-tag specs, common mistakes, and 4 worked examples for `/ralph-art-director`. Read this before calling `ralphy generate` for any fit-check project.

## Master prompt template

One keyframe per outfit. Each keyframe is one of: mirror-selfie waist-up, full-body cropped, slow-spin in-room, walk-toward-camera. Pass the user's garment reference into `--ref` for every frame.

```
Mirror entrance. <Subject description — pulled from persona ref>. Phone-in-mirror or
selfie-cam framing, <waist-up | full-body cropped | slow-spin | walk-toward-camera>.
Wearing: <outfit description — match the user-supplied garment reference EXACTLY:
exact cut, exact color, exact logo, exact texture. Do NOT improvise garment branding.>.
Setting: <bedroom / hallway / closet / street>, <natural | warm | cool> light.
Frame composition: outfit fills 70-85% of vertical frame, subject's face partially
visible (lower-third or in mirror). Hold for outfit-tag overlay in lower-third.
Negative: no fake brand, no logo distortion, no AI-improvised garment, no studio
lighting, no plastic skin, no model-look, no full-frontal-face-blocking-the-fit.
```

For each subsequent outfit in a multi-fit video, regenerate as a fresh keyframe. Same subject (pass persona ref), different setting beat (closet → hallway → street, or three angles in the same room).

## Mirror / spin / walk vocabulary

For `--prompt` on the i2v stage (`kling-v3.0-pro`, 5s clips), pick ONE motion verb per clip and stay specific:

### Slow spin
> "Subject performs a slow 180° spin, hand lightly on hip, weight shifting through the spin. Camera locked. The full outfit becomes visible from the back-three-quarter angle around mid-clip. End on front-facing pose with hand on hip."

### Mirror-cam from waist-up
> "Subject in front of a wall mirror, holding the phone in one hand at waist-up framing. Slight rotation of the torso left-then-right to show the outfit's drape. Other hand on hip mid-clip, then drops. End facing the mirror straight-on."

### Full-body cropped (statue-pose)
> "Subject stands full-body in frame, weight on one hip, the other leg slightly forward (model-pose contrapposto, but not exaggerated). Slight micro-motion only — no big walks. Hand-on-hip to hand-down transition mid-clip."

### Walk-toward-camera
> "Subject walks toward the camera from 4m away to 1.5m away over 5s. Confident pace, eye contact at the 3s mark, slight smile or neutral. Outfit's silhouette readable across the full walk."

### Hands-on-hip pose (static hero)
> "Subject in static hero-pose: feet shoulder-width, both hands on hips, slight torso angle to camera. Micro-breathing motion only. Hold for the full 5s. End-card text fades in over the last 1s."

## Beat-sync rules (the load-bearing mechanic)

This format lives or dies on cut-on-beat. The rules:

1. **Find the BPM first.** Every track has one. ElevenLabs Music output has it logged in the generation; trending-audio handles publish it. Do not start composition without knowing the BPM.
2. **Cut on downbeats only.** Downbeats are beat 1 of every bar (every 4 beats at 4/4). At 120 BPM that's a downbeat every 2.0s. At 100 BPM, every 2.4s. Never cut on a snare-hit or off-beat — it reads as a mistake.
3. **Pick one transition style per video and stay consistent.** snap, mirror-flash, or jump-cut. Mixing breaks the read.
4. **Hold the final pose 1-2s past the last cut.** The audience needs settling time before the swipe. End-card fades in over this hold.
5. **First cut lands no earlier than the first big drop.** If the music has an intro of 1-2s, the first outfit-change waits for the drop. Cutting through the intro buys nothing and feels arrhythmic.

### Transition style specs

- **Snap.** Hard cut, 1 frame. Lands on downbeat. Best for streetwear, drill, latin-trap.
- **Mirror-flash.** 2-frame white frame between outfits, on the downbeat. Best for hero pieces, fashion-editorial vibe.
- **Jump-cut.** 3 micro-cuts in 0.4s, all snapping to subdivisions of the downbeat (downbeat, downbeat + 1/8, downbeat + 1/4). Best for fast-fashion-haul, busy energy.

## Brand-tag overlay specs

Every outfit gets a tag. Two styles, pick one per video and stay consistent.

### Corner-tag (default)
- Position: lower-third, ~80% down the frame, 8-12% padding from left edge.
- Font: sans-serif bold. Suggested: Inter Bold, Söhne, or Helvetica Now. Size 32-40px.
- Content: `@handle · item name · $price` on one or two lines.
- Background: 60-80% opacity black or white pill, 8px corner radius.
- Animation: slide-in from left, 6 frames, eased-out. Hold for full duration of the outfit. Slide-out optional (often just hard-cut with the next outfit).

### Large-overlay (hero)
- Position: centered, ~50% down the frame.
- Font: sans-serif bold, larger — 80-120px.
- Content: brand name only on line 1; item + price small below on line 2.
- Background: none, or a thin underline. Sometimes a 1-frame white flash behind the text on entry.
- Animation: scale-in from 0.95 → 1.0 with opacity 0 → 1, 8 frames eased-out. Use only on hero items, not every fit.

## Music

Two paths:

### Trend-pick (preferred for daily content)
Use the platform's trending-audio panel. Reels: Reels Trends in the creator dashboard. TikTok: For You discovery + TikTok Trends. Pull the audio, log the BPM, plan cuts on downbeats.

### Licensed / generated
- ElevenLabs Music with a one-line prompt: `"<vibe>, <BPM> BPM, no vocals, strong downbeats every <X>s"`. Examples:
  - Streetwear / drill: `"drill instrumental, 130 BPM, hard 808 hits, no vocals, strong downbeats every 1.85s"`
  - Quiet-luxury / 90s-house: `"deep house instrumental, 95 BPM, smooth piano, sub-bass groove, no vocals, downbeats every 2.5s"`
  - Modesty / dream-pop: `"dream-pop instrumental, 90 BPM, soft synth pads, light percussion, no vocals, downbeats every 2.65s"`
  - Thrift / amapiano: `"amapiano instrumental, 110 BPM, log drums, shaker, no vocals, downbeats every 2.18s"`

Generate 5-10s longer than the video — gives Remotion margin to fade out cleanly.

## 6 mistakes (bottom-of-the-page critique)

1. **Cuts not on the beat.** The single biggest fit-check tell. If the first transition lands at 4.7s and the downbeat is at 4.9s, you wasted the format.
2. **Over-edited transitions.** Mixing snap + mirror-flash + jump-cut in the same Reel. Pick one. The video reads as confused otherwise.
3. **Brand-tag too small.** The corner-tag must be readable at 50% screen scale (because half the audience is multi-tasking). 24px font is too small. 32-40px minimum.
4. **A single outfit held too long.** A single fit on screen for > 8s without any motion or mirror-flash is a swipe trigger. Either add a mid-clip flash or shorten the hold.
5. **Brand-tag covering the actual item.** The whole point is to see the garment. If the lower-third tag is over the shoes you're tagging, move the tag up — or drop the shoes-tag and tag them in the caption.
6. **Generating an AI garment with no reference.** Refused by the gate. Never improvise a logo or weave on a "real" branded item — the audience clocks it instantly. (See `TEMPLATE.md` reference-required gate.)

## Worked examples

### Example A — Streetwear daily fit (single outfit, 7-10s)

**Brief.** "Today's streetwear fit. Hoodie + cargos + new sneakers I just got. One look, mirror selfie."

**Reference.** Hoodie photo, cargos photo, sneaker photo, all flat-lay. (3 garment refs, 1 persona ref.)

**Stack.**
- Keyframe (1): mirror-cam waist-up, hoodie + cargos visible, sneakers in a brief tilt-down at clip mid. `--ref hoodie.jpg --ref cargos.jpg --ref sneakers.jpg`
- i2v (1 × 5s): mirror-cam motion vocab. End with hand-on-hip pose held 2s.
- Music: drill instrumental, 130 BPM, no vocals, downbeats every 1.85s. ElevenLabs Music, 12s.
- Hook: "Today's fit" (#1 from `hooks.md`).
- Transition: ONE mirror-flash at the 4s mark (mid-clip energy beat), then hold the final pose 2s.
- Brand-tags: corner-tag, lower-third, `@handle · hoodie · $80` for first 4s, swap to `@handle · sneakers · $140` for the tilt-down moment.

**Total cost:** $0.15 + $0.70 + $0 (music sub) ≈ $0.85.

### Example B — Second-hand thrift haul (3 outfits, 15-20s)

**Brief.** "Thrift haul, 3 fits, all under $30 each. Show price tags, casual energy."

**Reference.** 3 outfit photos (one per fit), persona ref.

**Stack.**
- Keyframes (3): full-body cropped, slightly different room corners. Each with `--ref outfit-N.jpg`.
- i2v (3 × 5s): outfit 1 = slow-spin; outfit 2 = walk-toward-camera; outfit 3 = hands-on-hip static hero.
- Music: amapiano instrumental, 110 BPM, no vocals, downbeats every 2.18s. ElevenLabs Music, 18s.
- Hook: "Thrift haul: 3 pieces" (#7 from `hooks.md`).
- Transition: snap-cut on downbeats. First cut at ~5.5s (3rd downbeat after the 1s entrance), second cut at ~10.5s, hold the third fit 4-5s with a final pose.
- Brand-tags: corner-tag, `secondhand · $18`, `secondhand · $24`, `secondhand · $12`. Animated slide-in per fit.

**Total cost:** $0.45 + $2.10 + $0 ≈ $2.55.

### Example C — Workwear / formal (2 outfits, 12-14s)

**Brief.** "Two work-week fits. Day 1 is a blazer-and-slacks, day 2 is a knit-dress. Quiet-luxury feel."

**Reference.** 2 outfit photos, persona ref.

**Stack.**
- Keyframes (2): full-body cropped, near-identical framing for visual rhyme. `--ref blazer-fit.jpg`, `--ref knit-dress.jpg`.
- i2v (2 × 5s): static hero pose, micro-breathing only. Sophistication = restraint.
- Music: deep-house instrumental, 95 BPM, no vocals, downbeats every 2.5s. ElevenLabs Music, 14s.
- Hook: "Workwear edition" (#3 from `hooks.md`).
- Transition: ONE mirror-flash on the downbeat at ~6.5s (between the two fits). Mirror-flash, not snap — fits the slower BPM.
- Brand-tags: large-overlay, scale-in animation. "ARKET" for the blazer fit, "COS" for the knit dress. Item + price small below.

**Total cost:** $0.30 + $1.40 + $0 ≈ $1.70.

### Example D — Modesty fashion (1 outfit, 8-10s)

**Brief.** "Modest fit, long sleeves, maxi skirt, hijab. Calm, dream-pop vibe."

**Reference.** Outfit photo (top + skirt + hijab as one styled mirror shot), persona ref.

**Stack.**
- Keyframe (1): mirror-cam waist-up, soft natural light, light cool tones. `--ref modest-fit.jpg`.
- i2v (1 × 5s): mirror-cam from waist-up motion vocab. Gentle torso rotation, hand drops mid-clip. Hold final pose 2s.
- Music: dream-pop instrumental, 90 BPM, no vocals, downbeats every 2.65s. ElevenLabs Music, 10s.
- Hook: "Modest fits ✿" (#8 from `hooks.md`).
- Transition: ONE mirror-flash mid-clip at ~4.5s for visual breath. Never jump-cut here — it would read aggressive.
- Brand-tags: corner-tag, lower-third, soft cream pill background, `@handle · modest top · linked`. No price (modesty niche tends to soft-sell).

**Total cost:** $0.15 + $0.70 + $0 ≈ $0.85.

## Quality gate

- **Keyframe.** `scoreImage` average ≥ 7. The threshold is the standard one — fit-check doesn't have a stricter "logo-fidelity" payload like before-after-product (the garment IS the focus, not a small logo).
- **Video motion.** `scoreVideo` ≥ 5 for all clips. Watch out for: AI-warp on the spin, weave-distortion on rotation, hijab-fold inconsistency on modesty fits.
- **Beat-sync check (manual).** After render, scrub the timeline. Every cut must align to a downbeat within ±2 frames. If not, recut — never ship an off-beat fit-check.
