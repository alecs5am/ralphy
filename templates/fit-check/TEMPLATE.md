# Fit Check / OOTD — vibe style

**Genre:** fast outfit demo — 1-3 looks in one Reel, every cut on the beat. The format that turned daily-dress-up into mass content.
**Length:** 7-20s.
**Format:** Reels (dominant) / TikTok, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** When the brief names real garments, brands, or "the dress I bought yesterday", a reference (photo / hanger shot / mirror selfie of the actual item) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised garments always have wrong weave, wrong logo, wrong drape — and the audience sees it instantly.

## Why this works

The cheapest-to-make, easiest-to-loop fashion format on the platforms:

1. **Visual-first = mute-friendly.** No VO required. The outfit speaks; the audience scrolls muted; the cut-on-beat keeps them.
2. **Beat-synced transitions are a watch-loop drug.** Every transition that lands on a downbeat retriggers attention. 3 cuts × ~5s = 3 retriggers in 15s.
3. **Daily-content barrier is near-zero.** One outfit, one mirror, one cut — a creator can post a new one every morning. The format scales the way Hot-Take and Photo-Dump scale.
4. **Brand-tags read as authentic.** A small lower-third tag with `@brand $price` does the job of a 10s VO without breaking flow.

## Vibe anchors

- **Beat-synced cuts.** This is the whole format. Pick a track with audible downbeats; place every outfit-change on one. Off-beat = it reads as "video", not as "fit check".
- **Mirror-pose framing.** The grammar of the genre: phone in mirror, waist-up, slight angle, head turned to the lens or down to the phone. Even if shot full-body, mirror-energy is the read.
- **Brand-tag overlay.** `@handle · item · $price` in a sans-serif bold tag, lower-third corner by default. Animated entry (slide-in 6 frames) for hero items.
- **Trending audio = trend currency.** Pulling the audio-of-the-week (always check the platform's trends panel — Reels and TikTok both surface this) gives the video an audience-handle the algorithm pushes.
- **One transition style per video.** Don't mix snap + mirror-flash + jump-cut in the same Reel — pick one. Mixing reads as confused; consistency reads as a signature.
- **Final pose hold.** End on a 1-2s static pose. The audience needs a beat to register the last fit before they swipe.

## Variation axes

| Axis | Options |
|---|---|
| Outfit count | 1 (single-look hero) / 2 (day-night, before-after styling) / 3 (thrift haul, week-of-fits) |
| Transition style | snap (hard cut on downbeat) / mirror-flash (2-frame white flash) / jump-cut (3 micro-cuts in 0.4s) |
| Niche | streetwear, formal, second-hand / thrift, modesty, workwear, fast-fashion-haul, Y2K, quiet-luxury |
| Brand-tag style | corner-tag (small, lower-third) / large-overlay (centered, animated entry) |
| Music vibe | hyperpop, amapiano, latin-trap, drill, 90s-house, trending-audio-of-the-week |
| Subject framing | mirror-selfie waist-up / full-body cropped / slow-spin in-room / walk-toward-camera |

## Narrative arc

```
0-1s    → Mirror entrance / hook beat. Phone-in-mirror, "today's fit" text appears, music drops.
1-15s   → Outfit transitions on beat. Each outfit holds 4-6s; transition lands on the next downbeat.
            Brand-tag enters with each new fit (slide-in or fade-in, 6 frames).
15-20s  → Final hold / signature pose. Static, 1-2s. End-card with handle.
```

For a 7-10s single-outfit video, collapse to: 0-1s entrance → 1-8s outfit hold with one mid-clip mirror-flash → 8-10s pose hold.

For a 15-20s three-outfit video: 0-1s entrance → 1-6s fit-1 → 6-11s fit-2 → 11-16s fit-3 → 16-20s pose hold.

## Required user inputs

1. **Outfit references.** 1-3 photos (one per outfit). Flat-lay, hanger shot, or mirror selfie. **REQUIRED** when real garments are shown.
2. **Brief.** Niche (streetwear / workwear / thrift / etc.) + occasion (daily, week-recap, capsule, haul).
3. **Brand-tag content per outfit.** `@handle · item name · $price` (or whatever subset is true — `secondhand · $18` for thrift posts).
4. **Music track + BPM.** Either a trending-audio handle (Reels/TikTok trends panel) or a licensed track with known BPM. BPM determines cut count (≥100 BPM ≈ 3 cuts in 15s).
5. **(Optional) Single VO line.** Rare. ≤ 5 words. e.g. "Today's fit." If unset, video is silent-overlay only.

## Reference-required gate (hard refuse)

If the brief mentions real garments / a brand the user owns and no file exists at `workspace/projects/<id>/assets/uploaded/`:

> "The brief mentions '<garment / brand>'. I need a reference photo (the item flat-lay, on a hanger, or worn) — drop one in this chat, or rephrase to a generic-styling brief ('a black blazer, no specific brand'). I can't ship this without a reference — AI improvises weaves and logos and the audience sees it."

Override path: user explicitly says "generate without reference, I understand the quality will be worse" → log `stage: "no-ref-consent"` in `generations.jsonl` and proceed.

## When NOT to use

- **Story / depth.** If the brief needs a narrative beat, character motivation, or a "here's why I wore this" moment → `13-fashion-lookbook` (editorial) or `grwm` (process).
- **Single-outfit slow-reveal.** A hero piece that wants 10 seconds of slow camera-orbit and editorial light → `13-fashion-lookbook`. Fit-check is fast — slow it down and it loses the genre.
- **Heavy product-pitch / conversion.** If the goal is "buy this exact item now" with proof and demo → `before-after-product`. Fit-check tags items but doesn't sell them; the conversion is "discover the creator", not "click the SKU".
- **Multiple SKUs from one brand all explained.** That's a haul / lookbook hybrid — use `13-fashion-lookbook` and write VO.
- **No music available / unable to clear a track.** This format is 50% audio. Without a real beat, the cuts have nothing to land on.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 1-3 × `gemini-3-pro-image-preview` @ $0.15 (one per outfit) | $0.15 - $0.45 |
| Video clips | 1-3 × `kling-v3.0-pro` × 5s @ $0.14/s | $0.70 - $2.10 |
| VO | 0 (typical) or 1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) OR licensed track from the user | $0 |
| Brand-tag overlays | local Remotion text | $0 |
| Render | local | $0 |
| **Total** | | **~$0.85 - $2.55** |

The cheapest format in the pack — short clips, no VO, one music bed.

## Read also

- `hooks.md` — 10-12 fit-check opens, per niche / transition / music vibe.
- `prompt-cookbook.md` — master prompt template, mirror/spin/walk vocabulary, beat-sync rules, brand-tag specs, mistakes, 4 worked examples.
