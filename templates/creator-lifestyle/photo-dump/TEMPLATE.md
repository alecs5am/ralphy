# Photo Dump — vibe style

**Genre:** photo-dump / carousel-as-video — a "scrollable mood board" of 5-16 still photos that snap to the beat of a trending music bed.
**Length:** 10-25s.
**Format:** Reels (dominant) / TikTok / Shorts, 9:16, 30fps, 1080×1920.
**No video clips.** This is photo + beat-sync only — no i2v, no kling, no veo. That is a feature, not a limitation: it is the cheapest format in the pack and one of the highest-saving.

> **No reference gate.** Photo-dumps work both with user-supplied photos (personal dump / brand week-recap) and with AI-generated photos (aesthetic / niche dump). When the user is the subject — a face, a real product, a real place they own — prefer user photos and skip generation entirely. When the dump is an aesthetic mood with no specific subject, AI generation is fine. Mixing the two also works as long as the look stays cohesive.

## Why this works

The photo-dump is the cheapest, fastest-to-ship format in the pack and one of the most consistently engaging:

1. **Carousels print on engagement.** Buffer's *State of Social Media Engagement in 2026* (52M+ posts across 10 platforms) reports carousels at a median ER of 6.90%, single images at 4.44%, reels at 3.31%. Carousels earn roughly **109% more engagement per person reached than reels** — and the "carousel-as-video" photo-dump is the format that ports that gap into the video feed. (Source: Buffer 2026, *Key Finding #5*.)
2. **Low save-friction.** The "scrollable mood board" feel reads as personal rather than promotional, so viewers save it for later instead of swiping past.
3. **Match for the raw-aesthetic trend.** Film grain, golden hour, candid framing, slight imperfection — the format rewards exactly the look the algorithm is currently boosting.
4. **Production cost: near-zero with user photos.** A 12-photo dump from a user's camera roll + a licensed track + 3 minutes of beat-snap editing renders for $0 of API spend.

## Vibe anchors

- **Photo-on-beat snap.** Every photo lands exactly on a kick or snare. If a photo lands off-beat, the whole video reads as amateurish — viewers feel the off-ness even if they cannot name it.
- **Raw aesthetic.** Slight imperfection: motion blur, off-center subject, slightly underexposed, golden-hour skin. Studio-clean photos kill the format.
- **Cohesive look.** Single film stock, single grade, single grain level, single time-of-day where possible. Photos that look like they were taken with three different cameras break the dump.
- **Single trend bed.** One music track for the whole video. No cross-fades, no second track. The bed *is* the spine.
- **Short opening text overlay.** 1-7 words, kerned-out, low-key font. Sets the niche and gives the algorithm a hookable first second.
- **Last photo hold.** The final photo stays on-screen 1-2 beats longer than the others — a "stop scrolling" moment that ends the dump on a frame, not a fade.

## Variation axes

| Axis | Options |
|---|---|
| Photo source | user-supplied / AI-generated / mixed |
| Niche | travel / lifestyle / fashion / aesthetic / brand week-recap / product week-recap |
| Photo count | 5-16 (fewer = slower / more cinematic; more = chaotic / energetic) |
| Opening text | yes / no — and if yes, narrated or silent overlay |
| Audio bed | trend music / ElevenLabs lo-fi / ElevenLabs cinematic ambient / licensed track |
| Pacing | steady (one photo per beat) / ramped (slow opening, dense chorus, hold finale) |

## Narrative arc

```
0-1s     → Opening text overlay over photo 1 (or photos 1-2). Sets the niche.
                "October dump", "An ode to Lisbon", "What this week looked like."
1-23s    → Photos snap to the beat. Steady or ramped pacing.
                Steady: one photo per beat (≈12 photos at 110 BPM over 6.5s of chorus).
                Ramped: slower at the open (1 photo / 2 beats), dense in the chorus (1 photo / beat),
                hold on the closer.
23-25s   → Last photo holds 1-2 beats. No fade — hard cut to black or loop point.
```

Concrete pacing example, 14-photo dump at 110 BPM, 18s total:
- 0-1.5s — opening text over photo 1.
- 1.5-13s — photos 2-12, one per beat (≈ 0.55s each).
- 13-16s — photos 13-14, slower (1.5s each) for the closer.
- 16-18s — last photo hold + cut.

## Required user inputs

1. **Photo source** — either:
   - a folder of 5-16 JPG/PNG/HEIC files at `workspace/projects/<id>/assets/uploaded/photos/`, OR
   - a niche brief ("autumn cottage", "Lisbon weekend", "skincare brand week-recap") for AI generation.
2. **Music** — either:
   - a trend track (provide the file + BPM + downbeat offset in seconds), OR
   - a music brief for ElevenLabs ("lo-fi hip-hop, 90 BPM, no vocals", "cinematic ambient, 75 BPM, soft swells").
3. **Opening text line** (optional) — 1-7 words. Skip for a pure-music dump.
4. **Niche** (drives photo aesthetic + music vibe) — travel / lifestyle / fashion / aesthetic / brand / product.
5. **Pacing** (optional, default: steady).

## Cohesion gate (soft refuse)

The single failure mode that ruins this format is photo cohesion. Before composition, eyeball the photo set and ask:

- Same time-of-day across all photos? (Or intentionally arc'd: morning → night.)
- Same color palette? (No mix of warm-orange and cold-cyan unless the niche calls for it.)
- Same grain / film-stock look? (User photos straight from a phone are usually fine; AI-generated photos must be re-prompted with a shared aesthetic vocabulary — see `prompt-cookbook.md`.)
- Same vertical framing? (All 9:16, no mixed orientation.)

If two or more of these fail, refuse the render and ask the user to re-curate (user photos) or regenerate (AI photos) the broken set. Bad cohesion costs nothing to detect early and is unfixable at the render stage.

## When NOT to use

- **Story needs motion.** A weight-loss reveal, a recipe walk-through, a how-to — those need video. Use `fashion-lookbook` (motion + music) or `tutorial-how-to` (steps + VO).
- **Photos lack visual cohesion** and cannot be re-curated. Better to ship 5 cohesive photos than 14 messy ones — but if the user only has 4 photos and they don't match each other, this template will not save the project.
- **Conversion-first ad.** Photo-dumps drive saves and reach, not direct conversion. For a hard ad, use `before-after-product`.
- **Talking-head niche.** No face-to-camera here — that's `talking-head-rant` or `talking-character`.
- **Length > 30s.** Past 25-30s the format loses its scroll-stopper energy. Long photo essays belong on Pinterest, not Reels.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Photos (user-supplied) | 12 × phone photos | $0 |
| Photos (AI-generated) | 12 × `gemini-3-pro-image-preview` @ $0.15 | ~$1.80 |
| VO (optional, narrated opening) | 1 ElevenLabs call (subscription) | $0 |
| Music (trend track) | licensed / supplied | $0 |
| Music (ElevenLabs Music) | 1 call (subscription) | $0 |
| Captions | none | $0 |
| Render | local | $0 |
| **Total (user photos)** | | **$0** |
| **Total (AI-generated photos)** | | **~$1.80** |

The cheapest format in the pack. A user-photo dump with a licensed track is genuinely free.

## Read also

- `hooks.md` — 10-12 opening text patterns with niche fit and examples.
- `prompt-cookbook.md` — photo prompt vocabulary, beat-sync rules, music selection, transition style guide, six common mistakes, four worked examples (travel / brand week-recap / aesthetic / product week-recap).
