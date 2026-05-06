# Model stack — before-after-product

## Stage 0 — Reference gate

**Перед всеми API calls** проверь:

```bash
ls workspace/projects/<id>/assets/uploaded/ 2>&1
```

Должен быть хотя бы один файл — продукт / лого / упаковка. Если нет:

> "Brief упоминает '<product>'. Без референса делать не буду — выйдет AI-slop с галлюцинированным лого. Скинь фото / screenshot / упаковку."

(См. AGENTS.md hard rule #3, ralph-art-director/rules/ref-photo-policy.md.)

## Stage 1 — Before keyframes (3 sec timeline → 2-3 keyframes)

**Model:** `google/gemini-3-pro-image-preview`
**Cost:** ~$0.15/img × 2-3 = $0.30-0.45

```bash
ralphy generate image \
  --project <id> --slot scene-before-01 \
  --prompt "<pain-point fragment from fragments.md>" \
  --negative "no fake brand, no studio lighting, no model-look" \
  --size 1080x1920
```

Не нужен product ref в "before" сценах (продукт ещё не появился). Можно использовать persona ref если character consistency критичен.

## Stage 2 — Reveal frame (КЛЮЧЕВОЙ)

**Model:** `google/gemini-3-pro-image-preview`
**Cost:** ~$0.15
**Critical:** ВСЕГДА передавай product reference URL в `--ref`.

```bash
ralphy generate image \
  --project <id> --slot scene-reveal \
  --prompt "Product appears in scene as per provided reference. Hand holding / placing on counter / etc. AS PER THE PROVIDED REFERENCE IMAGE — exact packaging, exact logo, exact color. Do NOT improvise branding." \
  --ref <product-ref-url> \
  --negative "no fake brand, no logo distortion, no AI-improvised packaging" \
  --size 1080x1920
```

Quality gate — `scoreImage` для этой scene должен быть avg ≥ 8 (выше threshold обычного), с особым акцентом на fidelity. Если AI improvised'нул logo — мгновенный regen с stronger negative.

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

Product ref передавай в каждый frame где продукт видим.

## Stage 4 — i2v (video clips)

**Model:** `kwaivgi/kling-v3.0-pro`
**Cost:** $0.14/sec × 5 × 3-4 clips = $2.10-2.80
**Duration:** 5s per clip default; 3s для коротких "pain reinforcement" beats.

```bash
ralphy generate video \
  --project <id> --slot scene-XX-vid \
  --image <keyframe-url> \
  --prompt "<motion description per scene>" \
  --duration 5 \
  --model kwaivgi/kling-v3.0-pro
```

Motion per category:
- Pain → frustrated motion (sigh, slight slump, hand to head).
- Reveal → static or very subtle movement (product entering frame).
- Demo → action verb (applying / typing / wiping / etc).

## Stage 5 — Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2`
**Voice:** user-chosen clone.
**Settings split** (Two TTS calls):

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

Currently `cli/lib/providers/media.ts → generateVoiceover` принимает `voiceSettings` partial; pass через CLI добавим в Sprint 4 follow-on. Workaround: edit `prompts.json` voice_settings directly или передавай через extended generateVoiceover call.

## Stage 6 — Captions

```bash
ralphy generate captions \
  --project <id> --slot captions-before \
  --audio workspace/projects/<id>/assets/voiceover/vo-before.mp3 \
  --language ru \
  --output workspace/projects/<id>/captions-before.json

ralphy generate captions \
  --project <id> --slot captions-after \
  --audio workspace/projects/<id>/assets/voiceover/vo-after.mp3 \
  --language ru \
  --output workspace/projects/<id>/captions-after.json
```

Two separate captions files — different styles per section (Hormozi → Minimal).

## Stage 7 — Music (two beats)

```bash
ralphy generate music \
  --project <id> --slot music-before \
  --prompt "tense ambient instrumental, slight dissonance, low strings, 60 BPM, no vocals" \
  --duration 6   # 5s + 1s tail для cross-fade

ralphy generate music \
  --project <id> --slot music-after \
  --prompt "uplifting indie instrumental, light acoustic guitar + soft piano, 90 BPM, no vocals" \
  --duration 12   # 10s + 2s tail
```

Cross-fade в композиции на frame 150 (5s mark).

## Stage 8 — Compose + render

```bash
ralphy render <id>
ralphy render <id> --loudnorm
```

## Cost rollup (15s video)

| Stage | Detail | Cost |
|---|---|---|
| Before keyframes | 2-3× gemini | $0.45 |
| Reveal frame | 1× gemini (с ref) | $0.15 |
| After keyframes | 2× gemini | $0.30 |
| Video clips | 4× kling × 5s | $2.80 |
| VO | 2 calls (subscription) | $0 |
| Captions | 2× whisper-1 | $0.002 |
| Music | 2× ElevenLabs Music (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$3.70** |

## Quality gate

- **Reveal frame** — `scoreImage` avg ≥8 (стрjogal threshold т.к. logo accuracy critical). Если avg <8 — regen максимум 2 раза с stronger negative. На 3-м failure — refuse render и ask user better reference.
- Other frames — avg ≥7.
- Video motion ≥5 для всех clips.

## Avoid

- Genereть keyframe без product ref в reveal — гарантированный logo galluc.
- veo-3.1 для этого формата — overkill, не нужен lip-sync.
- Single music бед — cross-fade — это половина импакта формата.
