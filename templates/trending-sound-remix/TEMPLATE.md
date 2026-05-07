# Trending Sound Remix — vibe style

**Genre:** audio-first short-form. Take a currently trending sound and overlay your niche interpretation on top of it.
**Length:** 7-25s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.
**Audio-first:** the trending sound IS the music. Audio starts at frame 0. No intro silence, ever.

> **Reference-required gate.** The user MUST supply the trending audio — either a TikTok/Reels URL the agent fetches via `ralphy ref pull --url <url> --audio-only`, or a direct `.mp3` / `.m4a` / `.wav` file at `workspace/projects/<id>/assets/uploaded/`. AI cannot pick the current trend (training is stale) and cannot license tracks. Without source audio, `/ralph-art-director` refuses (AGENTS.md hard rule #3).

## Why this works

The biggest "cheat code" of the algorithm in 2025-26:

1. **Pre-validated reach.** A sound that's already trending has been pre-tested by millions of plays. The algo is actively boosting anything that uses it.
2. **24-48h window = max boost** (SocialPilot 2026 data). Posting on a sound while it's still climbing the curve is when distribution explodes. After 48h post-peak the sound is dead.
3. **Audio at frame 0 = strong sound-on signal.** TikTok / Reels reward videos that retain sound-on viewers. Intro silence breaks that signal in the first 0.5s and tanks the score.
4. **Niche overlay = pre-validated reach + your specificity.** You inherit the audio's distribution and convert it into followers for *your* niche.

## Vibe anchors

- **Audio starts immediately.** Frame 0 = first beat or first vocal syllable. No silence, no fade-in, no logo intro.
- **Beat-snap cuts.** Every shot change lands on a kick, snare, or vocal-peak. Tight to the audio, never floating.
- **Text-overlay angle.** 1-2 short lines, large bold sans-serif, top of the frame. Tells the viewer in 0.5s why this audio is funny / true / on-point for your niche.
- **No intro silence, no outro fade.** Either hold the last beat or let it loop-restart cleanly.
- **Don't out-shout the trend.** The trend audio is the protagonist. Visuals support it; visuals don't compete with it.

## Variation axes

| Axis | Options |
|---|---|
| Niche | any — beauty, cooking, fitness, B2B SaaS, real estate, fashion, finance, pets… |
| Beat profile | kick-heavy / vocal-snippet / drop-based / lofi-loop |
| Text-overlay angle | explainer ("the [audio] is [our niche thing]") / reaction / setup-payoff / quote-the-audio |
| Presentation | face-on-camera vs faceless / product-only / screen-recording |
| Duration tier | 7-10s tight loop / 12-18s standard / 20-25s extended |

## Narrative arc

```
0-1s    → Audio at frame 0. First beat-cut HAS to land here. Text overlay appears.
1-Ns    → Beat-synced visuals. One shot per beat-segment (3-8 shots total).
           Each cut lands on a kick / snare / vocal-peak from beats.json.
last 1s → Hold the final beat (clean ending) OR loop-restart on the first beat (designed to replay).
```

The structure is **evergreen**. The sound is **throwaway**. Only the structure goes into the template; the user re-supplies a fresh trending sound for each post.

## Required user inputs

1. **Trending audio** — TikTok/Reels URL OR direct audio file. **REQUIRED.** Without it: refuse.
2. **Niche** — what world the visuals live in (e.g., "lipstick reveals", "B2B SaaS dashboard", "sourdough kitchen").
3. **Your angle** — one line: why this audio fits this niche. ("The 'pinky up' lyric = the lipstick pinky pose every reveal.")
4. **(Optional) Beat-timestamps** — if the user already has them, drop a `beats.json`. Otherwise the agent extracts them.
5. **(Optional) Text-overlay copy** — 1-2 lines. The agent writes a default if absent.
6. **(Optional) Face-on-camera or faceless** — defaults to faceless (AI-generated visuals).

## Reference-required gate (hard refuse)

If no audio source is supplied:

> "This template needs a trending sound — drop a TikTok/Reels link or an audio file. I can't auto-pick a current trend (my training is stale) and I can't license a song on your behalf. If you want an original-music format, use `10-music-video` instead."

## When NOT to use

- **Audio is licensed / copyrighted on YOUR account.** Original / commercial accounts get muted on TikTok. Use `10-music-video` for original-music formats.
- **Post window > 48h after trend peak.** The sound is dead; you'll just be a late entry. Either pick a fresher trend or use a different template.
- **Your niche has no visual answer to this audio.** If you can't write a one-line "your angle" without straining, the remix won't land. Pick a different sound.
- **Long-form (>30s).** This format is for tight, beat-locked clips. Past 25s the audio loop becomes obvious and tension drops.
- **Brand-storytelling.** This is a reach format, not a brand-narrative format. Use `12-brand-story`.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Source audio | `ralphy ref pull --url <trend-url> --audio-only` (yt-dlp under the hood) | $0 |
| Keyframes | 3-8 × `gemini-3-pro-image-preview` @ $0.15 | $0.45 - $1.20 |
| Video clips | 3-8 × `kling-v3.0-pro` × 1-3s @ $0.14/s | $0.50 - $3.40 |
| VO (optional) | 0-1 ElevenLabs calls (subscription) | $0 |
| Music | NONE — the trend audio is the music | $0 |
| Captions | NONE by default; text overlay is rendered in Remotion | $0 |
| Render | local | $0 |
| **Total** | | **~$0.95 - $4.60** |

The cheapest reach-oriented format in the pack — most of the budget is the i2v clips.

## Read also

- `hooks.md` — 10-12 sound-remix angle patterns with audio-profile fit + niche example.
- `prompt-cookbook.md` — beat-extraction recipe, beat-snap cut rules, text-overlay rules, three worked examples, CLI cookbook for grabbing audio.
