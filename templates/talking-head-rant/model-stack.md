# Model stack — talking-head-rant

## Stage 1 — Character image

**Model:** `google/gemini-3-pro-image-preview` через OpenRouter
**Cost:** ~$0.15
**Goal:** photorealistic character в setting'e, eye-level, eye-contact (5° offset).

```bash
ralphy generate image \
  --project <id> --slot character-keyframe \
  --prompt "<character fragment from fragments.md>" \
  --negative "no logo, no branded text, no watermark, no plastic skin" \
  --size 1080x1920
```

Если у пользователя есть persona reference photo (`workspace/projects/<id>/assets/uploaded/`):
```bash
ralphy generate image \
  ... --ref <ref-url>
```

## Stage 2 — Talking-head video

### Default: veo-3.1 (premium lip-sync)

**Model:** `google/veo-3.1` через OpenRouter
**Cost:** $0.50/sec → $7.50 для 15s clip
**Why:** best lip-sync quality в нашем pool. Worth it для talking-head формата.

```bash
ralphy generate video \
  --project <id> --slot talking-head \
  --image <character-keyframe-url> \
  --prompt "Character speaks naturally to camera, subtle head movements, eye blinks. Lip-sync to provided audio." \
  --duration 15 \
  --model google/veo-3.1
```

**ВАЖНО:** veo-3.1 требует audio reference для lip-sync. На текущий момент `cli/lib/providers/media.ts` не передаёт audio в request body. **TODO для production:** extend `generateVideo` чтобы принимать `audio` URL и пропускать в OpenRouter videos endpoint. Workaround сейчас: использовать kling fallback (см. ниже).

### Cheap fallback: kling-v3.0-pro (no native lip-sync)

**Model:** `kwaivgi/kling-v3.0-pro`
**Cost:** $0.14/sec × 15 = $2.10
**Approach:** генерь generic talking motion, не lip-sync. VO играется поверх — расхождение губ-аудио visible, но при HormoziCaptions overlay часто скрывается captions'ом.

```bash
ralphy generate video \
  --project <id> --slot talking-head \
  --image <character-keyframe-url> \
  --prompt "Subtle head movements, occasional nods, eye blinks, slight body shifts. Mouth movement implied but not synced." \
  --duration 15 \
  --model kwaivgi/kling-v3.0-pro
```

**Когда выбирать:**
- veo-3.1 — если бюджет $7+ на видео и lip-sync критичен.
- kling — если bulk batch (10+ видео) и лип-sync precision не критична.

## Stage 3 — Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2`
**Voice:** user-chosen clone (best для deadpan).
**Settings:** stability 0.55, similarity 0.8, style 0.25.

```bash
ralphy generate voiceover \
  --project <id> --slot vo-master \
  --voice <voiceId> \
  --text "<full monologue text>"
```

Длинный монолог — single call. Если scenarist разбил по beats — генери per beat и concat в композиции.

## Stage 4 — Captions

```bash
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/vo-master.mp3 \
  --language ru
```

Word-level. Hormozi / Karaoke потом импортирует Caption[].

## Stage 5 — Music

```bash
ralphy generate music \
  --project <id> --slot music-bed \
  --prompt "minimal lo-fi background, very low energy, subtle piano, 60 BPM, almost imperceptible, no vocals" \
  --duration 18
```

Volume 0.10-0.12 в композиции (минимальный — не competing с VO).

## Stage 6 — Hook screenshot (optional)

Если scenario указывает hook screenshot:
1. Чат генерит mockup screenshot через Pencil MCP / dashboard tools или user supplies его в `assets/uploaded/hook.png`.
2. Composition использует `src/lib/components/overlays/HookScreenshot.tsx` (TODO Sprint 3.3 — uncreated пока, но контракт в `composition.md`).

## Stage 7 — Compose + render

```bash
ralphy render <id>
ralphy render <id> --loudnorm   # post-process EBU R128
```

## Cost rollup (15s video, veo-3.1 path)

| Stage | Detail | Cost |
|---|---|---|
| Character image | gemini-3-pro-image-preview | $0.15 |
| Talking-head video | veo-3.1 × 15s | $7.50 |
| VO | subscription | $0 |
| Captions | whisper-1 | $0.001 |
| Music | subscription | $0 |
| Render | local | $0 |
| **Total** | | **~$7.65** |

### Cheap path (kling fallback)

| Stage | Cost |
|---|---|
| Character image | $0.15 |
| Talking-head video (kling × 15) | $2.10 |
| Other | ~$0 |
| **Total** | **~$2.25** |

## Quality gate

- `scoreImage` на character keyframe — avg ≥7.
- `scoreVideo` на talking-head — особенно motion ≥5 (no warping face).
- veo-3.1 обычно выдаёт первый раз; kling может потребовать 1-2 regen.

## Avoid

- **wan-25** (нет в v2 стеке — был fal.ai).
- **veo-3.1 generate_audio: true** — TTS native не русский (см. MODELS.md avoid).
- Static "frozen" image-as-video (e.g. ImageSequence из 1 frame'а) — выглядит дёшево.
