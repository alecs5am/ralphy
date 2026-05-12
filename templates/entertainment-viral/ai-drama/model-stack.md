# Model stack — ai-drama

Order of operations and the specific models we call (via OpenRouter or ElevenLabs). Two-key stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL.

This stack is **deliberately thinner than most templates** — Veo native audio replaces the entire VO + music substacks. See the bottom of this file for what NOT to call.

## Stage 0 — Cast lock-strings

Before any image gen, draft a `lock_string` for every named character. A lock-string is one paragraph describing the character so identically that Veo / Gemini can re-summon them from text alone. This is load-bearing — Veo has no character-lock primitive, so visual consistency lives in your prompt strings.

Example (from fruit-drama-001):

```
banana-husband: "a Pixar-3D cartoon banana-headed man, smooth glossy yellow
banana peel head with brown ripe spots, friendly round black eyes, small mouth,
wearing a slightly rumpled white office shirt with rolled sleeves and a loose
navy tie, beige trousers, mid-30s nervous family-man vibe"
```

Inject the full lock-string into every keyframe prompt and every Veo prompt that includes the character. Yes, every single one. Yes, even when it makes the prompt long.

## Stage 1 — Keyframes

**Model:** `google/gemini-3-pro-image-preview` via OpenRouter
**Cost:** ~$0.15/image
**Why:** best multi-reference + photoreal-leaning rendering that handles "Pixar-3D" prompts very cleanly. One keyframe per scene.

```bash
ralphy generate image \
  --project <id> --slot scene-01-keyframe \
  --size 1080x1920 \
  --prompt "Pixar-style 3D animation still, vertical 9:16, <setting>. <lock_string_a>. <lock_string_b>. <action description>. <lighting>. Pixar-3D cinematic look. No text, no captions, no subtitles." \
  --negative "text, watermark, captions, subtitles, letters, photorealistic humans, anime, dark horror"
```

For consistency across 7 scenes, you can also generate one optional "cast lineup" keyframe first showing all main characters together, then use it as a `--ref` for each per-scene keyframe. In practice the lock-strings alone are usually enough.

## Stage 2 — i2v (video) — **the music-policy stage**

**Model:** `google/veo-3.1` via OpenRouter
**Cost:** ~$0.50/sec → $4.00 per 8s clip
**Duration:** 8 seconds per clip (Veo supports 4/6/8; default 8 for full dialogue room).
**Audio:** `generate_audio: true` (`--audio` flag). **This is the dialogue voice.**

```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --model google/veo-3.1 \
  --duration 8 \
  --resolution 1080p \
  --aspect-ratio 9:16 \
  --audio \
  --first-frame "<path-to-scene-01-keyframe.png>" \
  --prompt "<see prompt template below>"
```

### The literal Veo prompt template (with the no-music clause baked in)

Copy this template for **every single scene's Veo call**. The bolded clauses are non-negotiable.

```
Pixar-style 3D animation, <setting one-liner>.

<lock_string for every character in frame, full paragraph each>.

<Action: who does what, in present-tense English, naming the spoken
dialogue beats explicitly.>

<Speaker> speaks ON CAMERA, mouth moving naturally with visible lip
movement, <voice timbre — e.g. "warm motherly female voice mid-30s,
slightly tearful">, in <LANGUAGE>: "<exact dialogue line in that language>".

<Optional second speaker block, same shape.>

Camera: <camera direction — static, slow push-in, long-lens tracking>.
Lighting: <lighting one-liner>.

**Audio direction: only the character's spoken dialogue and minimal natural
room tone appropriate to the setting. No background music. No instrumental
soundtrack. No score. No swelling strings, no piano underscore, no orchestral
bed. Strict diegetic audio only — only sounds that exist physically in
the scene (footsteps, door, traffic if outdoors). Silence between lines.**

No narrator. No voiceover. Only the named character(s) speak on camera.
No on-screen text, no captions, no subtitles, no burned-in lower thirds.
```

### Why the no-music clause is load-bearing

Veo 3.1 with `--audio` has a strong default to add a Hollywood-style score under every clip, ducked under the dialogue. Without explicit anti-instruction:

- Every scene gets a *different* Veo-decided score (one might be sad piano, the next dramatic strings, the next quirky pizzicato).
- The scores don't transition between scenes — you get audible musical jump-cuts every 8 seconds.
- If you then add an ElevenLabs music bed on top (don't!), you get TWO uncoordinated music layers, both ducked under dialogue, both audible in every pause.

With the no-music clause, Veo outputs:
- Dialogue (the priority)
- Minimal natural room tone — kitchen-hum, traffic-distant, breath, footsteps
- **Silence** in dialogue pauses

That silence is what makes the cut feel cinematic. It also lets the popwords caption animation breathe.

### Language audio quality (verified 2026-05-08 in MODELS.md)

| Language | Audio quality | Use it? |
|---|---|---|
| English | Clean, lip-sync convincing | ✓ default |
| Chinese | Clean | ✓ |
| Russian | Accent slips, words cut | ⚠ flag the user explicitly, get override |
| Ukrainian | Same as Russian | ⚠ |
| Other | Untested in this stack | Ask the user; default to English |

### Don't reach for these instead

- `kwaivgi/kling-v3.0-pro` — no native audio. You'd have to add ElevenLabs voiceover separately, which means lip-sync drift and broken speech timing. Wrong tool for this format.
- `bytedance/seedance-2.0` with `--audio` — leaks audio with a Ukrainian-tinted voice on Russian text and ignores language locks. Documented in MODELS.md.
- `google/veo-3.1-fast` — works for this format and is much cheaper (~$0.14/sec → ~$8 total for 56s). Facial micro-expressions are noticeably less convincing. Acceptable downgrade if cost is the bottleneck.

## Stage 3 — Voiceover — **SKIP THIS STAGE**

> **NEVER call `ralphy generate voiceover` in this template.**

Veo native audio IS the voiceover. Adding ElevenLabs TTS on top means:
- Two voice tracks competing for the same lip-sync
- Veo audio (which has the actual lip-sync) gets buried under the louder ElevenLabs track
- Or the user mutes Veo to use ElevenLabs — which produces drift because Veo's lip-sync is timed to Veo's audio, not the new external audio

If you find yourself thinking "but I want a cleaner voice" — that's the cue to switch to `kwaivgi/kling-v3.0-pro` (different template) for a silent visual track + external TTS, not to layer external TTS on top of Veo.

## Stage 4 — Captions

**Model:** ElevenLabs `scribe_v1` via `ralphy generate captions`
**Cost:** ~$0.004 per audio-minute (~$0.004 for a 56s video).
**Component:** `PopWordCaptions` from `src/lib/components/captions/PopWordCaptions.tsx`
**Font:** `public/fonts/TheBoldFont.ttf` (TheBoldFont 700 — the canonical Hormozi/MrBeast/fruittales TikTok caption typeface)

```bash
# Transcribe the concat.mp4's audio to word-level captions
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/render/final.mp4 \
  --language en
```

The PopWordCaptions component:
- One word at a time (no token grouping)
- Spring scale pop-in (scale 0.55 → 1.0)
- White fill with heavy black stroke + drop shadow
- Bottom-center anchored, `bottomOffset={360}` default (sits above TikTok engagement column)
- `fontSize={140}` default for 1080×1920

## Stage 5 — Music — **SKIP THIS STAGE**

> **NEVER call `ralphy generate music` in this template.**

Yes, this is the same point as stage 3 but for music. Yes, it bears repeating because it's the most common bug in this format. The reference fruit-drama-001 had this exact bug in its first build — fixed by deleting the music stage entirely.

Veo native audio includes scene-appropriate ambient under every clip. With the no-music clause in the prompt, that ambient is minimal and diegetic. Adding ElevenLabs music on top:
- Adds a second uncoordinated music layer
- Both layers ducked under the same dialogue
- Both audible in dialogue pauses → mud
- The Veo ambient bleeds through the ElevenLabs sidechain even when you crush it

**The right move if you want a stronger musical bed:** strip out Veo audio entirely from the concat (use kling-v3.0-pro for visuals, ElevenLabs for VO, ElevenLabs Music for bed) — but at that point you're not in this template anymore. Use a different template.

## Stage 6 — Compose + render

**Composition path:** `src/videos/<project-slug>/index.tsx` per project.
**Skeleton:** see `composition.md`.

```bash
# Concat the 7 Veo mp4s into one (preserves audio per clip)
P=workspace/projects/<id>
ralphy video concat \
  --files $P/assets/videos/scene-01-vid.mp4,...,scene-07-vid.mp4 \
  --out $P/render/concat.mp4

# Loudnorm to TikTok target. NO extra music mix step.
ffmpeg -i $P/render/concat.mp4 \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:v copy -c:a aac -b:a 192k \
  $P/render/final.mp4

# Render with PopWordCaptions overlay
ralphy render <id>
```

The Remotion render does the captions overlay; Veo audio comes through `OffthreadVideo`. No `<Audio>` component for music, no `<Audio>` component for VO — single audio source = the concatenated Veo native audio.

## Cost rollup (56s video, 7 scenes)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 7 × gemini-3-pro-image-preview | $1.05 |
| Video clips | 7 × veo-3.1 × 8s | $28.00 |
| VO | **NOT CALLED** | $0 |
| Captions | scribe_v1 on 56s | $0.004 |
| Music | **NOT CALLED** | $0 |
| Render | local | $0 |
| **Total** | | **~$29.05** |

Drop in cost-down mode (veo-3.1-fast): ~$8 total. Drop in cost-down + 6 scenes (48s): ~$7.

## Quality gates

- `scoreImage` average ≥ 7 per keyframe — otherwise regen (max 2 attempts per slot). Check: is the lock-string still recognizable in the output?
- After Veo render, transcribe the audio with `ralphy generate captions` and **compare line-by-line to the scenario dialogue**. If the model misspoke or trimmed, regen the clip with a more emphatic dialogue beat in the prompt.
- After concat, `ffmpeg silencedetect=noise=-35dB:d=0.4` — if there are **zero** silence gaps in a 56s clip that has dialogue pauses, the no-music clause failed. Regenerate the offending scene with a stronger anti-music phrasing.
- Two failures in a row on the same scene → stop, surface concrete options to the user (different dialogue, different setting, switch to veo-3.1-fast, switch to silent + external TTS).
