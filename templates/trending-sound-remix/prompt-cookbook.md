# Prompt Cookbook — Trending Sound Remix

This is the operational recipe for the agent. The art-director playbook reads this before generating prompts; the editor playbook reads it before composing the Remotion timeline. Everything here assumes the trending audio already lives at `workspace/projects/<id>/assets/uploaded/trend.<ext>`.

---

## Master template

```
[Audio: trending sound, supplied by user, plays from frame 0]
[Beats: extracted to beats.json — array of timestamps in seconds]
[Niche: <user-supplied niche>]
[Angle: <user-supplied 1-line angle>]
[Text overlay: <1-2 short lines, top of frame, large bold sans-serif>]

For each beat-segment i in beats.json:
  → keyframe_i: niche-specific image, consistent visual register, one clear subject
  → clip_i: i2v from keyframe_i, duration = (beats[i+1] - beats[i]) seconds, no audio
  → cut to clip_(i+1) exactly at beats[i+1]
```

The structure is evergreen. Only `[Audio]`, `[Niche]`, `[Angle]`, and `[Text overlay]` change between videos.

---

## Audio analysis (quick method)

You have two paths. Use whichever is faster for the audio in hand.

### Path A — `ffprobe` for tempo + manual beat picks

```bash
# Sanity: confirm the audio loaded and find duration
ffprobe -v error -show_entries format=duration -of csv=p=0 \
  workspace/projects/<id>/assets/uploaded/trend.mp3

# Extract a rough beat envelope (peaks in the audio waveform)
ffmpeg -i workspace/projects/<id>/assets/uploaded/trend.mp3 \
  -af "highpass=f=80,lowpass=f=200,silencedetect=n=-30dB:d=0.05" \
  -f null - 2>&1 | rg silence_(start|end)
```

Read the `silence_start` / `silence_end` timestamps — the gaps between them are your beat events. Write them to `workspace/projects/<id>/beats.json`:

```json
{
  "audioFile": "trend.mp3",
  "duration": 14.8,
  "beats": [0.00, 0.52, 1.04, 1.56, 2.08, 4.20, 6.30, 8.40, 10.55, 14.20],
  "type": "kick-heavy",
  "loopRestart": true
}
```

### Path B — listen and tap

For trending sounds with a clear vocal hook, just listen on repeat and tap out the beats with a stopwatch. Faster than ffprobe for vocal-snippet trends (which dominate the format).

Aim for **3-8 beat events**. Fewer = boring. More = stroboscopic.

---

## Beat-snap cut rules

1. **Every shot change lands on a beat.** Never float a cut between beats. If the audio has a kick at 1.04s, the cut happens at 1.04s, not 1.00s and not 1.10s.
2. **First cut at frame 0** (or as close as the first beat allows). Audio + visual *both* start at frame 0.
3. **No cross-fades, no dissolves.** Hard cuts only. The audio is the connective tissue, not the transitions.
4. **Last shot holds the final beat.** Either hold to the audio's natural end, or design a clean loop-restart back to the first beat.
5. **Clip duration = beat-segment duration, exactly.** If `beats[2] = 1.56` and `beats[3] = 2.08`, clip 2 is 0.52s long. Generate the i2v at that length (round to nearest 0.1s for kling).

---

## Text overlay rule

- **1-2 lines max.** If you need 3, the angle is wrong — sharpen it.
- **Top of frame.** Bottom is for captions; this isn't captions, it's an angle statement.
- **Large bold sans-serif.** Font ≥ 80px in 1080×1920. Inter Bold, Helvetica Bold, or system bold sans.
- **High contrast.** White text + black drop-shadow OR black text on a white pill.
- **Present for the FULL duration.** No animations in/out. The overlay is constant; the visuals change underneath it.
- **Quote audio literally OR state your angle.** Don't editorialize.

Render via Remotion `<AbsoluteFill>` + a styled `<div>`, NOT via the captions pipeline. Captions are a different format and will conflict with the overlay.

---

## Visual variety rules

- **3-8 shots, never fewer than 3.** Less than 3 reads as a static post. More than 8 in a 25s clip reads as stroboscopic.
- **One clear subject per shot.** Don't pack two ideas into one beat-segment.
- **Consistent visual register.** All shots same lighting style, same color register, same camera distance. The audio is the variable; visuals are the constant.
- **No intro logo, no outro logo.** Both are intro/outro silence by another name. Niche identity comes through the visuals and the angle, not a logo card.

---

## Audio production: pulling the source

The trending audio comes from one of three places. The agent picks based on what the user supplied.

### Case 1 — User dropped a TikTok/Reels link

```bash
ralphy ref pull \
  --url "https://www.tiktok.com/@user/video/1234567890" \
  --slug trend-X \
  --audio-only
```

This wraps `yt-dlp` and writes the extracted audio to `workspace/projects/<id>/assets/uploaded/trend.<ext>`. The CLI handles format detection (m4a / mp3 / opus → normalized to mp3 if needed).

### Case 2 — User dropped a direct audio file

Move it to `workspace/projects/<id>/assets/uploaded/trend.<ext>`. Done. No conversion needed unless the format isn't browser-playable (rare).

### Case 3 — User said "use the audio from this video they posted"

Same as Case 1. The agent uses `ralphy ref pull --audio-only` regardless of platform. Never call `yt-dlp` or `curl` directly — go through ralphy so the gen-log records the pull.

---

## 6 mistakes that kill this format

1. **Intro silence.** Even 0.3s of silence at frame 0 kills the sound-on signal. Audio MUST start at frame 0.
2. **Cuts not on beat.** The viewer feels the desync immediately even if they can't articulate it. Always snap to `beats.json`.
3. **Text overlay too long.** 3+ lines of text or a sentence past 8 words = nobody reads it. Tighten or cut.
4. **Niche-fit unclear.** If the angle doesn't read in the first 1.5s, the viewer scrolls. The text overlay exists to short-circuit this.
5. **Audio is post-peak.** Trending sounds are ephemeral (3-7d to peak). Posting > 48h after peak = no algorithmic boost. Refuse and ask for a fresher trend.
6. **Generating audio.** Never call ElevenLabs Music for this template. The trending sound IS the music. Calling music generation = format violation.

---

## Worked example 1 — "PINKY UP" (KATSEYE) × beauty niche

**Audio:** vocal-snippet "PINKY UP" lyric, kick-heavy verse, ~12s clip.
**Niche:** lipstick reveals.
**Angle:** "The 'pinky up' is when you blot the lipstick."
**Text overlay:** `the pinky up is the blot ✋💄` (top of frame, white-on-black-pill).
**Pattern (from `hooks.md`):** #3 "The [audio sound] is [your interpretation]" + #1 "When [audio context] but you're [your-niche]".

`beats.json`:
```json
{ "audioFile": "trend.mp3", "duration": 12.0,
  "beats": [0.00, 0.50, 1.00, 1.50, 2.00, 4.50, 7.00, 9.50, 12.00],
  "type": "vocal-snippet" }
```

Shots:
1. **0.00 → 0.50s** — close-up of lipstick tube, cap on, on a marble counter.
2. **0.50 → 1.00s** — cap pops off (in motion).
3. **1.00 → 1.50s** — bullet revealed, slight rotation.
4. **1.50 → 2.00s** — first swipe across lips (sharp cut on the kick).
5. **2.00 → 4.50s** — full lips colored in, hand brings tissue up.
6. **4.50 → 7.00s** — pinky-up blot pose against the tissue (lands on the "PINKY UP" lyric).
7. **7.00 → 9.50s** — tissue comes down with a perfect lip-print.
8. **9.50 → 12.00s** — final lip close-up holding the last beat.

Loop restart: shot 8's last frame matches shot 1's marble-counter framing.

---

## Worked example 2 — "Sugar on My Tongue" × cooking niche

**Audio:** Tyler the Creator vocal-driven hook, drop-based, ~16s.
**Niche:** dessert prep / fridge-pull moments.
**Angle:** "Every fridge-pull is a fridge dance."
**Text overlay:** `the fridge dance` (top, white bold).
**Pattern:** #5 setup-payoff (drop = fridge open) + #6 reaction-cut.

`beats.json`:
```json
{ "audioFile": "trend.mp3", "duration": 16.0,
  "beats": [0.00, 1.20, 2.40, 3.60, 4.80, 8.00, 11.20, 14.40, 16.00],
  "type": "drop-based" }
```

Shots:
1. **0.00 → 1.20s** — hand on fridge handle, anticipation.
2. **1.20 → 2.40s** — fridge opens, light spills out.
3. **2.40 → 3.60s** — wide shot of fridge interior (the drop hits at 3.60).
4. **3.60 → 4.80s** — pose 1: cake reach.
5. **4.80 → 8.00s** — pose 2: holding cake plate at shoulder.
6. **8.00 → 11.20s** — pose 3: spoon-in-mouth reaction.
7. **11.20 → 14.40s** — pose 4: fridge-door close pose.
8. **14.40 → 16.00s** — counter close-up of the cake, fork plunge on final beat.

---

## Worked example 3 — generic vocal-snippet × B2B SaaS

**Audio:** any rising-tension vocal-snippet trend, ~10s.
**Niche:** B2B SaaS dashboard demo.
**Angle:** "Every UI screen on the beat = the demo your founder wishes you'd record."
**Text overlay:** `the dashboard tour, but on beat` (top, white-on-black).
**Pattern:** #7 list-on-beats.

`beats.json`:
```json
{ "audioFile": "trend.mp3", "duration": 10.0,
  "beats": [0.00, 1.25, 2.50, 3.75, 5.00, 6.25, 7.50, 10.00],
  "type": "kick-heavy" }
```

Shots:
1. **0.00 → 1.25s** — login screen, cursor entering email.
2. **1.25 → 2.50s** — dashboard home, all green metrics.
3. **2.50 → 3.75s** — analytics tab, chart animating in.
4. **3.75 → 5.00s** — pipeline view, cards flipping.
5. **5.00 → 6.25s** — settings panel, toggles flipping on.
6. **6.25 → 7.50s** — invoice export, PDF rendering.
7. **7.50 → 10.00s** — closing on the founder smiling at the cost report (final beat hold).

For SaaS shots: prefer `gemini-3-pro-image-preview` with reference UI screenshots from the user's actual product, then `kling-v3.0-pro` short i2v. Faked SaaS UI reads as fake instantly — match the user's real product where you can.

---

## CLI cookbook

Pull source audio (TikTok / Reels / YouTube Shorts):

```bash
ralphy ref pull \
  --url "<trend-url>" \
  --slug trend-<niche> \
  --audio-only
```

Generate keyframes (one per beat-segment):

```bash
ralphy generate image \
  --project <id> \
  --slot scene-01-keyframe \
  --prompt "<niche-specific keyframe prompt>" \
  --model google/gemini-3-pro-image-preview
```

Generate i2v clips (one per beat-segment, exact segment duration):

```bash
ralphy generate video \
  --project <id> \
  --slot scene-01-clip \
  --keyframe scene-01-keyframe \
  --duration <segment-seconds> \
  --model kwaivgi/kling-v3.0-pro \
  --no-audio
```

(Optional) one VO line in a quiet pocket:

```bash
ralphy generate voiceover \
  --project <id> \
  --slot pocket-vo \
  --text "<one-line niche explainer>"
```

Render the composition (Remotion reads `beats.json` and your audio):

```bash
ralphy render <id>
```

**Never** call `ffmpeg`, `yt-dlp`, `curl`, or any provider API directly. All of these are wrapped by `ralphy` so the gen-log, asset-manifest, and cost rollup stay consistent (AGENTS.md hard rule #2).
