# Model stack — ai-vegetables

Order of operations and the specific models we call (via OpenRouter or ElevenLabs). Two-key stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL.

## Stage 1 — Keyframes

**Model:** `google/gemini-3-pro-image-preview` via OpenRouter
**Cost:** ~$0.15/image
**Why:** best multi-reference for keeping the same vegetable consistent across scenes, and it lands photorealistic vegetable rendering cleanly without prompt acrobatics.

```bash
ralphy generate image \
  --project <id> --slot scene-01-bg \
  --prompt "<vegetable fragment> + <setting fragment> + camera details" \
  --model google/gemini-3-pro-image-preview \
  --size 1080x1920
```

If you need consistency across scenes, generate a "character ref" first (just the vegetable on a neutral background), then pass its URL into `--ref` for every scene keyframe afterward.

## Stage 2 — i2v (video)

**Model:** `kwaivgi/kling-v3.0-pro` via OpenRouter
**Cost:** ~$0.14/sec
**Duration:** 5 seconds per clip (default; 10s if a scene needs to develop).
**Audio:** `generate_audio: false` (always — VO is added separately).

```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --image <keyframe-url> \
  --prompt "subtle handheld shake, vegetable performs <action>, slight push-in 5%, no morphing of limbs" \
  --duration 5 \
  --model kwaivgi/kling-v3.0-pro
```

**Avoid:**
- `bytedance/seedance-2.0` with `generate_audio: true` — leaks audio with a Ukrainian-tinted voice on Russian text and ignores LANGUAGE LOCK in the prompt.
- `google/veo-3.1` — overkill for absurd content and ~3× the cost. Use only if you genuinely need its motion fidelity.

## Stage 3 — Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2`
**Voice:** user-chosen clone (deadpan delivery in any language). If the user has no clone, fall back to a library voice but flag that the result will sound less native.
**Settings:** stability 0.55, similarity_boost 0.8, style 0.25, use_speaker_boost: true.
**Output:** mp3_44100_128.

```bash
ralphy generate voiceover \
  --project <id> --slot scene-01-vo \
  --voice <voiceId> \
  --text "POV: you're a cucumber and you're late."
```

VO is short — one line per scene, ≤ 7 words. Don't stretch.

## Stage 4 — Captions

**Model:** `openai/whisper-1` via OpenRouter
**Cost:** ~$0.006/audio-min (~$0.001 for a 15s video).

```bash
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language en   # or ru, depending on the VO
```

Output: `captions.json` in `Caption[]` format (the shape `@remotion/captions` expects). Word-level timestamps are on by default — needed by `HormoziCaptions` and `KaraokeCaptions`.

## Stage 5 — Music

**Model:** ElevenLabs Music `music_v1`
**Cost:** subscription
**Duration:** total video duration + 2s tail for the fade-out.
**Settings:** `force_instrumental: true` (load-bearing — vocals fight with VO).

```bash
ralphy generate music \
  --project <id> --slot music-bed \
  --prompt "<music fragment from fragments.md>" \
  --duration 17
```

## Stage 6 — Compose + render

**Composition:** `src/videos/<project-slug>/index.tsx` (per-project) or the base `UGCVideo` component if the structure matches.
**Render:** `ralphy render <id>` (≤ 30s wall time for a 15s video on local hardware).

```bash
ralphy render <id> --loudnorm   # EBU R128 -16 LUFS for TikTok
```

## Cost rollup (15s video, 4 scenes)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 4× gemini-3-pro-image-preview | $0.60 |
| Video clips | 4× kling-v3.0-pro × 5s | $2.80 |
| VO | 4 calls (subscription) | $0 |
| Captions | whisper-1 | $0.001 |
| Music | ElevenLabs Music (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$3.40** |

Cheaper than `soviet-nostalgic` (~$10-14) — no dual-music, no era flip, shorter clips.

## Quality gates

- `scoreImage` average ≥ 7 per keyframe — otherwise regen (max 2 attempts per slot).
- `scoreVideo` motion ≥ 5 per clip — failures usually mean kling morphed limbs; reduce push-in or shorten the clip and retry.
- Two failures in a row on the same slot → stop and report concrete options to the user (different vegetable, different action, different model).
