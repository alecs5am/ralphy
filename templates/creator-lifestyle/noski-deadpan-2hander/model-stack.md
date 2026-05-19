# Model stack — Noski Deadpan 2-Hander

Two-key stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL, no Vercel. All media calls route through `cli/lib/providers/media.ts`. Cost figures derived from `workspace/projects/noski-people-001/logs/generations.jsonl` (130 entries, $23.15 total).

## Cost per stage (source-project actuals)

| Stage | Calls | Model | $ |
|---|---|---|---|
| Master portraits | 2 | `openai/gpt-5.4-image-2` | $0.40 |
| Location-master-plate + scene anchors + details + alts | 33 | `google/gemini-3-pro-image-preview` | $4.95 |
| **Image subtotal** | **35** | | **$5.35** |
| Kling dialog clips (32 scenes + 6 variety regens + 1 finale) | 39 | `kwaivgi/kling-v3.0-pro` | $17.78 |
| Music bed (1 successful + 1 rejected ToS retry) | 2 | `elevenlabs/music_v1` | $0 (subscription) |
| Scribe captions transcription | ~53 | `elevenlabs/scribe_v1` | $0.012 |
| Render | 4 final cuts + ~10 intermediates | local ffmpeg | $0 |
| **TOTAL** | | | **$23.15** |

Minimum-viable on a similar 73s 32-scene piece: $18-19 with rules 1, 6, 7 from TEMPLATE.md applied.

## Stage 1 — Master character portraits

**Model:** `openai/gpt-5.4-image-2` via OpenRouter
**Cost:** $0.20/call
**Goal:** photoreal single-portrait identity locks. No scene context, no props, plain backdrop.

```bash
ralphy generate image \
  --project <id> --slot master-character-a-portrait \
  --model openai/gpt-5.4-image-2 \
  --size 1080x1920 \
  --prompt "<from prompt-cookbook.md Stage 1>" \
  --negative "<from prompt-cookbook.md Stage 1 negative block>"
```

**Why this model:** at the single-portrait scale, GPT-image-2 produces the cleanest photoreal skin + natural features. Gemini-3-pro-image is great with multi-ref but defaults to slightly glossier skin on no-ref portraits.

**What to avoid:** do NOT use `google/imagen-4`, `black-forest-labs/flux-schnell`, or any other budget image model for this stage — identity drift across the 30+ subsequent multi-ref calls is fatal if the master portrait itself is fuzzy.

## Stage 2 — Location-master-plate (anchor #1, RULE 1)

**Model:** `google/gemini-3-pro-image-preview` via OpenRouter
**Cost:** $0.15/call
**Goal:** wide front establishing image of the room WITH both characters seated head-back in canonical positions. Locks couch geometry, rug, wall, lamp, props, lighting direction.

```bash
ralphy generate image \
  --project <id> --slot location-master-plate \
  --model google/gemini-3-pro-image-preview \
  --ref <master-character-a-portrait-url> \
  --ref <master-character-b-portrait-url> \
  --size 1080x1920 \
  --prompt "<from prompt-cookbook.md Stage 2>" \
  --negative "<from prompt-cookbook.md Stage 2 negative block>"
```

**Why this model:** multi-ref support is the killer feature. With 2 character refs + a detailed room prompt, produces consistent couch/wall/lighting/identity across 30+ scene-anchor regens.

## Stage 3 — Scene anchors (canonical close-ups + details + variety angles)

**Model:** `google/gemini-3-pro-image-preview` via OpenRouter
**Cost:** $0.15/call × 14-18 calls = $2.10 - $2.70
**Goal:** every scene's first frame. Each anchor carries the multi-ref pair `location-master-plate.png + relevant master-character.png`.

```bash
ralphy generate image \
  --project <id> --slot <scene-anchor-slot> \
  --model google/gemini-3-pro-image-preview \
  --ref <location-master-plate-url> \
  --ref <master-character-X-portrait-url> \
  --size 1080x1920 \
  --prompt "<from prompt-cookbook.md Stage 3 — close-up or detail variant>"
```

**Heuristic:** for a 32-scene project, plan ≥14 unique anchor angles upfront (3+ per character × 2 characters = 6 character close-ups, + 1 location plate, + 4-6 story-driven details, + 1-2 two-shot wides, + 1 top-down finale anchor). Source-project ran 12 anchors initially and had to do a $2.66 variety pass; planning 14-18 upfront is cheaper than regening Kling clips on too-few anchors.

**What to avoid:**
- Skipping the location-plate `--ref` on scene anchors → different couches per call (verified failure mode, source project turn 8)
- Frontquarter close-ups with "head fully tipped back" → compositional contradiction (source-project rule 5; both `cu-girl-frontquarter` and `cu-boy-frontquarter` ended up unused — $0.30 wasted)
- Strict 90° top-down + WIDE framing + both subjects → anatomy bugs (twisted torsos, body parts sticking out). Use top-down only for tight single-face shots or the finale 2-shot. Source-project tried 4 variants of `top-down-wide-reveal`, all 4 had anatomy issues.

## Stage 4 — Kling video clips (dialog + silent cutaways)

**Model:** `kwaivgi/kling-v3.0-pro` via OpenRouter with `--audio`
**Cost:** $0.14/sec × 3-5s = $0.42-$0.70 per clip × 24-36 clips = $10-$25
**Goal:** per-scene i2v with native lip-sync + voice-profile-driven VO.

```bash
ralphy generate video \
  --project <id> --slot scene-<NN>-vid \
  --model kwaivgi/kling-v3.0-pro \
  --first-frame <ABSOLUTE-path-to-anchor.png> \
  --duration 3 \
  --audio \
  --prompt "<from prompt-cookbook.md Stage 5 or 6>"
```

**Why this model:** the only viable choice for human-anchored i2v with natural English lip-sync. Voice profile blocks in prompts produce consistent voices across 12+ separated clips (verified at scale in source project, 24 dialog clips).

**Critical params / constraints:**
- `--audio` is canonical for **English target only**. For RU / UA / non-EN → unsafe (accent slip, voice age drift). Use ElevenLabs `eleven_multilingual_v2` post-mix instead, and disable `--audio`.
- Prompt cap: 2500 characters. Keep voice profile block + dialog line + music ban tight.
- Min clip duration: 3s. Per-clip fixed billing regardless of how much content fits.
- For scenes <3s in scenario beats: either generate at 3s and trim ~50% in post (paying for unused frames at $0.20), or bundle adjacent short scenes into one multi-shot Kling call. Source project chose the former for simpler QA — pay ~$3 extra vs ~$2 in alternative bundled approach.
- **Use absolute paths for `--first-frame`** — source project had 6 failed Kling gens at turn 14 due to cwd drift inside a bash for-loop. Wrap multi-step bash in subshell `(cd ...; do-stuff)` or just use absolute paths.

**What to avoid:**
- `bytedance/seedance-2.0` — privacy filter blocks photoreal-human i2v anchors even when AI-generated (`feedback_seedance_rejects_realistic_people` memory). Use Kling for any human-anchored i2v.
- `google/veo-3.1` / `veo-3.1-lite` — higher fidelity lip-sync but ~3-5× the cost. Kling's lip-sync is sufficient for deadpan delivery where mouth shape doesn't need to be hyper-accurate.
- Single "no music" line in the prompt — gets ignored on slow-tempo clips. Use the sevenfold ban from prompt-cookbook.md Stage 5.

## Stage 5 — Music bed

**Model:** `elevenlabs/music_v1`
**Cost:** $0 per call (subscription)
**Goal:** single lofi cafe instrumental bed at 65 BPM, -22 LUFS, ~110s (5s longer than total video for fade-out tail).

```bash
ralphy generate music \
  --project <id> --slot lofi-bed-v1 \
  --duration 110 \
  --force-instrumental \
  --prompt "<from prompt-cookbook.md Stage 7>"
```

**What to avoid:**
- Naming specific artists in the prompt ("like Brian Eno", "Music for Airports", "J Dilla") — `400 Terms of Service violated`. Source project hit this on first ambient drone attempt. Use genre + tempo + instrumentation + LUFS only.
- Forgetting `--force-instrumental` → ElevenLabs may add vocals, which kill the under-VO mix.
- Defaulting to -14 LUFS (standard pop loudness) → music competes with VO. -22 LUFS is the working ceiling for deadpan-philosophical pieces with almost-whispered VO.

## Stage 6 — Speech-aware trim + concat

**Model:** `elevenlabs/scribe_v1` for word-level timestamps; ffmpeg for trim + concat.
**Cost:** ~$0.0002/clip → ~$0.01 for 50 calls.

```bash
# Per-clip transcribe to get word startMs/endMs
ralphy generate captions --project <id> --audio scene-NN.wav --language en
# Then: trim_start = first_word_start_ms - 250ms, trim_dur = (last_word_end_ms - trim_start) + 350ms
```

**Critical ffmpeg recipe (50ms audio fade in/out, RULE in editor playbook):**

```bash
# Per-clip pre-process — re-encode audio with 50ms fade-in + fade-out
ffmpeg -i scene-NN.mp4 \
  -af "afade=t=in:st=0:d=0.05,afade=t=out:st=$((dur-0.05)):d=0.05" \
  -c:v copy -c:a aac -b:a 192k \
  trimmed/scene-NN.mp4

# Then concat — RE-ENCODE, not -c copy
ffmpeg -f concat -safe 0 -i list.txt \
  -c:v libx264 -c:a aac \
  final.mp4
```

**What to avoid:**
- `ffmpeg -f concat -c copy` on Kling clips → audible click at every scene boundary (AAC stream-boundary issue). Source project hit this on `final-v1-rough-cut.mp4`; user flagged at turn 16.
- Hardcoded `clip_dur = 3000ms` for all scenes → silently cuts speech on 4s-generated clips. Source project bug at scene 24 (`final-v3.mp4`). Always `ffprobe` real duration first.
- `elevenlabs/scribe_v1` throws hard exception on silent audio rather than returning empty. Wrap calls in try/except if batch-transcribing silent cutaway scenes.

## Summary table — what worked vs what to avoid

| Stage | Picked | Why | Avoided | Why |
|---|---|---|---|---|
| Master portrait | `openai/gpt-5.4-image-2` | Best photoreal skin at single-portrait scale | Gemini-3 / Imagen-4 / Flux | Slight gloss / fuzzier identity |
| Multi-ref scene anchor | `google/gemini-3-pro-image-preview` | Killer multi-ref support, consistent across 30+ calls | Single-ref-only models | Couch/identity drift |
| Video i2v with EN lip-sync | `kwaivgi/kling-v3.0-pro --audio` | Native lip-sync + cross-clip voice consistency via prompt blocks | Seedance-2.0 | Privacy filter blocks photoreal humans |
| Video i2v premium | (none — Kling sufficient) | — | Veo-3.1 | 3-5× cost, marginal gain for deadpan |
| Music | `elevenlabs/music_v1` | Subscription = no per-call cost; lofi register validated | (none) | — |
| VO (EN) | Kling `--audio` (native) | One pass, voice consistency anchor | ElevenLabs separate VO | Adds a render stage, no quality gain |
| VO (non-EN) | ElevenLabs `eleven_multilingual_v2` | Kling `--audio` unsafe for non-EN | Kling `--audio` on RU/UA | Accent slip, age drift |
| Captions | `elevenlabs/scribe_v1` | Word-level timestamps for speech-aware trim | — | — |
| Render | local ffmpeg | No animated overlays needed for deadpan register | Remotion | Overkill for 32 hard-cut clips |
