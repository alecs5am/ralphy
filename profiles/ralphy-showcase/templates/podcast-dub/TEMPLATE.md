# Podcast Dub — Russian → English karaoke shorts

A **workflow template** (not a vibe/script template) for taking a Russian podcast-style short and producing an English-dubbed version that mirrors the original edit. The chat is responsible for running ElevenLabs Dubbing, pulling the English transcript, converting it to `@remotion/captions` format, and assembling the final Remotion composition.

This template encodes the pipeline, not the voice or visual style — those come from the user's input videos. The *point* is that two engineers can hand the chat a raw Russian clip + a finished Russian short and get back an English cut that looks and times identically.

Concrete reference: [`workspace/projects/lyadov-podcast-001/`](../../projects/lyadov-podcast-001/) — 10 business-interview shorts dubbed from Russian to English. Red title banner, 3-words-per-line karaoke, active word highlighted red. See [reference-example.md](reference-example.md) for specifics and why certain decisions were made.

## When to use this template

- You have a Russian-language short (TikTok/YouTube Shorts/Reels) that already has a finished edit — title banner, captions, motion.
- You want an English version for an international audience.
- The visual content is human-face-forward (podcast, interview, talking head) — no on-screen Russian text to translate in-frame.
- You want the *same* edit style on the English cut, not a fresh take.

**Not for:**
- Videos where on-screen Russian text needs to be translated in place (requires a separate text-replacement pass).
- Cases where you want a *different* edit on the English version — just write a fresh composition.
- Languages other than RU→EN without revisiting voice choice and caption font subset.

## Required inputs per short

Before kicking off dubbing, collect (and log via `ralph project log-asset`):

1. **Raw Russian source video** (`assets/source/ep{NN}_ru_raw.mp4`) — the speaker talking Russian. No cuts, no overlays. This is the visual track the final English cut plays over (muted).
2. **Edited Russian reference short** (`assets/reference/ep{NN}_ru_edited.mp4`) — the finished Russian version. Used by the chat to:
   - Read the title-banner text and translate it to English (2 short lines, Oxford-quote style).
   - Confirm title banner position, color, duration.
   - Confirm caption placement (bottom padding), words-per-line, active-word highlight color.
   - Pick up any motion/zoom cues to replicate.
3. **Speaker voice preference** — whether to preserve the speaker's voice via ElevenLabs voice cloning (use the source as voice sample) or use a named default voice. Preserving voice is the default; mention explicitly if the user wants otherwise.
4. **Optional title override** — if the user wants a different English headline than what the Russian title translates to.

Log each input at collect time:

```bash
ralph project log-asset <id> --kind video --source <path-to-raw-ru> --purpose source-raw-ru
ralph project log-asset <id> --kind video --source <path-to-edited-ru> --purpose edit-reference-ru
ralph project log-prompt <id> --text "title override: <...>" --stage direction   # if given
```

## Pipeline

```
raw RU video  ──────────────────────────────┐
                                            │
   ↓ ElevenLabs /v1/dubbing (source: ru, target: en)
                                            │
en_dubbed.mp4/mp3 + en_transcript.json      │
                                            │
   ↓ convert-transcript.ts                  │
                                            │
captions-NN.ts (@remotion/captions)         │
                                            │
   ↓ ffmpeg: extract audio track to m4a     │
                                            │
ep{NN}_audio.m4a  +  captions-NN.ts  + raw RU video
                                            │
   ↓ Remotion composition (per-episode defaultProps)
                                            │
ep{NN}.mp4 English-dubbed short
```

Implementation details in [dubbing-flow.md](dubbing-flow.md); composition skeleton in [composition.md](composition.md).

## What the chat decides vs. what the user provides

| Decision | Source |
|---|---|
| English title text (2 lines) | Chat translates from reference; user may override |
| Title banner color, position, duration | Read off reference short; [fragments.md](fragments.md) has defaults |
| Caption position (bottom padding) | Read off reference short |
| Words per line, active-word highlight color | Read off reference; default 3 + `#FE0100` |
| Font family / weight | Default Inter 900 (Latin subset); user may override |
| Voice (cloned speaker vs library) | User preference; default = preserve speaker |
| Filler-word stripping | Default strip `uh, um, huh, hmm, ah` from captions |

## Batch mode

The reference project dubbed 10 shorts in one pass via a single `setup-all.ts` that iterated file-naming pattern. For new batches, use the same pattern:

```
workspace/projects/{project-id}/assets/
  source/      ep01_ru_raw.mp4, ep02_ru_raw.mp4, ...
  reference/   ep01_ru_edited.mp4, ep02_ru_edited.mp4, ...
  voiceover/   ep01_dubbed.m4a, ep01_transcript.json, ...
```

One Remotion composition with `defaultProps={{ episode: "01" }}` and a per-episode registration in `Root.tsx`. See [reference-example.md](reference-example.md) for the 10-episode registration pattern.

## Cost ballpark

Per short (~1 minute):
- ElevenLabs Dubbing: per-minute billing (Creator+ plan) — ~1 credit-minute per minute of source audio with voice cloning enabled.
- ElevenLabs STT (if separate): `scribe_v1` ~$0.40/hour.
- Remotion render: local, free.

For a 10-short batch of ~1-minute clips: roughly ~10–15 minutes of dubbing credits plus ~10 minutes STT.

## Files in this template

- `TEMPLATE.md` (this file) — workflow overview, when to use, inputs, pipeline
- [reference-example.md](reference-example.md) — lyadov-podcast-001 specifics + annotations
- [dubbing-flow.md](dubbing-flow.md) — ElevenLabs Dubbing + STT API usage, transcript conversion
- [composition.md](composition.md) — Remotion TSX skeleton (video + dubbed audio + title + karaoke)
- [fragments.md](fragments.md) — reusable style/config knobs (title banner, karaoke, filler-word list)
- `template.json` — machine-readable metadata
