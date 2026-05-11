# Model stack — before-after-product

Order of operations and the specific models we call (via OpenRouter or ElevenLabs). Two-key stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL.

## Stage 0 — Reference gate

**Before any API call**, verify a reference exists:

```bash
ls workspace/projects/<id>/assets/uploaded/ 2>&1
```

There must be at least one file — product photo, packaging, or logo. If the directory is empty:

> "The brief mentions '<product>'. I won't ship without a reference — the result would be AI-slop with hallucinated branding. Drop a photo / screenshot / packaging image and I'll continue."

(See AGENTS.md hard rule #3 and [`../../docs/playbooks/art-director/ref-photo-policy.md`](../../docs/playbooks/art-director/ref-photo-policy.md).)

## Stage 1 — Before keyframes (~5s of timeline → 2-3 keyframes)

**Model:** `google/gemini-3-pro-image-preview`
**Cost:** ~$0.15/img × 2-3 = $0.30 - $0.45

```bash
ralphy generate image \
  --project <id> --slot scene-before-01 \
  --prompt "<pain-point fragment from fragments.md>" \
  --negative "no fake brand, no studio lighting, no model-look" \
  --size 1080x1920
```

The product reference isn't needed in "before" scenes (the product hasn't appeared yet). Pass the persona reference if character consistency matters.

## Stage 2 — Reveal frame (THE KEY FRAME)

**Model:** `google/gemini-3-pro-image-preview`
**Cost:** ~$0.15
**Critical:** always pass the product reference URL into `--ref`.

```bash
ralphy generate image \
  --project <id> --slot scene-reveal \
  --prompt "Product appears in scene as per the provided reference. Hand holding / placing on counter / etc. AS PER THE PROVIDED REFERENCE IMAGE — exact packaging, exact logo, exact color. Do NOT improvise branding." \
  --ref <product-ref-url> \
  --negative "no fake brand, no logo distortion, no AI-improvised packaging" \
  --size 1080x1920
```

Quality gate: `scoreImage` for this scene must average ≥ 8 (a higher threshold than other scenes), with special weight on fidelity. If the model improvised the logo, regen immediately with a stronger negative.

## Stage 3 — After keyframes (transformation / demo)

**Model:** `google/gemini-3-pro-image-preview`
**Cost:** ~$0.30 (2 frames typical)

```bash
ralphy generate image \
  --project <id> --slot scene-after-01 \
  --prompt "<demo / transformation fragment from fragments.md>" \
  --ref <product-ref-url> \
  --size 1080x1920
```

Pass the product reference into every frame where the product is visible.

## Stage 4 — i2v (video clips)

**Model:** `kwaivgi/kling-v3.0-pro`
**Cost:** $0.14/sec × 5s × 3-4 clips = $2.10 - $2.80
**Duration:** 5s per clip default; 3s for short "pain reinforcement" beats.

```bash
ralphy generate video \
  --project <id> --slot scene-XX-vid \
  --image <keyframe-url> \
  --prompt "<motion description per scene>" \
  --duration 5 \
  --model kwaivgi/kling-v3.0-pro
```

Motion per category:
- **Pain** → frustrated motion (sigh, slight slump, hand to head).
- **Reveal** → static or very subtle movement (product entering frame).
- **Demo** → action verb (applying, typing, wiping, etc.).

## Stage 5 — Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2`
**Voice:** user-chosen clone.
**Two TTS calls** with different settings:

### "Before" VO (frustrated)
```bash
ralphy generate voiceover \
  --project <id> --slot vo-before \
  --voice <voiceId> \
  --text "<pain hook + reinforcement>"
```
Voice settings: stability 0.45, style 0.30.

### "After" VO (relieved)
```bash
ralphy generate voiceover \
  --project <id> --slot vo-after \
  --voice <voiceId> \
  --text "<reveal + demo + outro>"
```
Voice settings: stability 0.60, style 0.20.

`cli/lib/providers/media.ts → generateVoiceover` accepts a partial `voiceSettings` object today; passing it through the CLI flag is a Sprint 4 follow-on. Workaround in the meantime: edit `prompts.json` voice_settings directly, or call `generateVoiceover` from a small helper.

## Stage 6 — Captions

```bash
ralphy generate captions \
  --project <id> --slot captions-before \
  --audio workspace/projects/<id>/assets/voiceover/vo-before.mp3 \
  --language en \
  --output workspace/projects/<id>/captions-before.json

ralphy generate captions \
  --project <id> --slot captions-after \
  --audio workspace/projects/<id>/assets/voiceover/vo-after.mp3 \
  --language en \
  --output workspace/projects/<id>/captions-after.json
```

Use `--language ru` (or whichever language the VO is in) to pin the right whisper model.

Two separate caption files — each section gets its own caption style (Hormozi → Minimal).

## Stage 7 — Music (two beats)

```bash
ralphy generate music \
  --project <id> --slot music-before \
  --prompt "tense ambient instrumental, slight dissonance, low strings, 60 BPM, no vocals" \
  --duration 6   # 5s + 1s tail for cross-fade

ralphy generate music \
  --project <id> --slot music-after \
  --prompt "uplifting indie instrumental, light acoustic guitar + soft piano, 90 BPM, no vocals" \
  --duration 12   # 10s + 2s tail
```

Cross-faded in the composition at frame 150 (5s mark).

## Stage 8 — Compose + render

```bash
ralphy render <id>
ralphy render <id> --loudnorm
```

## Cost rollup (15s video)

| Stage | Detail | Cost |
|---|---|---|
| Before keyframes | 2-3× gemini | $0.45 |
| Reveal frame | 1× gemini (with ref) | $0.15 |
| After keyframes | 2× gemini | $0.30 |
| Video clips | 4× kling × 5s | $2.80 |
| VO | 2 calls (subscription) | $0 |
| Captions | 2× whisper-1 | $0.002 |
| Music | 2× ElevenLabs Music (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$3.70** |

## Quality gate

- **Reveal frame** — `scoreImage` average ≥ 8 (stricter threshold because logo accuracy is load-bearing). On average < 8, regen up to 2 times with a stronger negative. After the third failure, refuse the render and ask the user for a better reference.
- **Other frames** — average ≥ 7.
- **Video motion** — score ≥ 5 for all clips.

## Avoid

- Generating the reveal keyframe without a product reference — guaranteed logo hallucination.
- `google/veo-3.1` for this format — overkill; you don't need lip-sync here.
- A single music bed — the cross-fade is half the impact of the format.
