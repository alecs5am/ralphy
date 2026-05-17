# 06 — Utilities — SPEC

> **Vision.** Every local operation (ffmpeg, ffprobe, whisper.cpp, palette tools) has a single canonical Ralphy verb. Agents never reach for raw `ffmpeg`. Local model paths are opt-in but boringly reliable.

## Scope

**In:**

- ffmpeg recipe library (`audio` + `video` verbs)
- Smart-crop with face/saliency tracking
- Captioning: cloud + local
- Video / audio / image probing
- Local-model architecture (whisper.cpp first, others later)

**Not in (cross-references):**

- API-based gen → [`01`](../01-cli/) and provider layer
- Render (Remotion) → [`docs/playbooks/remotion.md`](../../docs/playbooks/remotion.md)
- Quality scoring of utility outputs → [`08`](../08-quality-and-evaluation/)

---

## 06.01 ffmpeg recipe library

Every ffmpeg invocation Ralphy makes is a documented, tested recipe in `cli/lib/recipes/`.

### 06.01.01 Audit current recipes, consolidate into `cli/lib/recipes/`  [~]
**v1.0:** yes

**Acceptance criteria:**
- New module structure: `cli/lib/recipes/{audio,video,probe}/<recipe>.ts`.
- Each recipe is one exported function with typed input/output + a JSON-schema'd CLI wrapper.
- Today's verbs (loudnorm, sidechain-duck, concat, extract-segment, burn-subs, tonemap-hdr, smart-crop) all migrated.
- CI grep: `ffmpeg` and `child_process` appear only inside `recipes/`.

### 06.01.02 Recipe verbs share common flags  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Standard flag set per recipe: `--input <path>`, `--output <path>` (or `--in-place`), `--project <id>` (optional, infers paths), `--dry-run`.
- `--dry-run` prints the resolved ffmpeg command without executing.
- Same precedence everywhere: explicit `--input` > `--project` inference > error.

### 06.01.03 `docs/ffmpeg-recipes.md` regenerates from code  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy video recipes --write-docs` regenerates the markdown reference.
- CI fails if the checked-in doc diverges.

### 06.01.04 Recipe tests use a 1-second fixture  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `tests/fixtures/utilities/1s-portrait.mp4` (a deterministic 1s 9:16 1080×1920 clip with audio) is the input for every recipe test.
- Tests assert duration, codec, resolution, channel count of the output.
- Test wall-time per recipe < 2s.

### 06.01.05 ffmpeg version pinning  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy doctor` checks for ffmpeg >= a known good version (initial floor: 7.0).
- Recipes use only flags supported in that version (lint test).
- `install.sh` recommends/prompts the right install path per OS.

---

## 06.02 Smart-crop

Center-crop loses the subject when they're not centered. Smart-crop tracks the salient region and crops dynamically.

### 06.02.01 `ralphy video smart-crop` uses face + saliency  [~]
**v1.0:** yes

**Acceptance criteria:**
- Default backend: ffmpeg `cropdetect` + a face-tracker (`vidstab` + a lightweight face model bundled, see Q-01).
- `--aspect <ratio>` (`9:16` default).
- `--track face|saliency|center` chooses the strategy.
- Output passes the green-zone check on the TOP-5 templates ([`08.02.x`](../08-quality-and-evaluation/)).

### 06.02.02 Fallback strategies and warnings  [ ]
**v1.0:** yes

**Acceptance criteria:**
- If face tracker finds nothing for > 50% of frames, falls back to saliency.
- If saliency is flat, falls back to static center crop + warning event in NDJSON.
- Warning is also surfaced in `ralphy project log` for the run.

### 06.02.03 Stabilization pass  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `--stabilize` flag adds a `vidstabdetect` + `vidstabtransform` pass post-crop.
- Disabled by default (doubles wall-time).

---

## 06.03 Captions: cloud + local

`ralphy project transcribe` uses whisper-1 via OpenRouter by default. Local whisper.cpp is the opt-in alternative.

### 06.03.01 `RALPHY_CAPTION_BACKEND=cloud|local` switch  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Env var (or `--backend` flag) routes captioning. Default `cloud`.
- `local` requires whisper.cpp + a model checkpoint installed; `ralphy doctor` reports presence.
- Both backends produce identical output schema (`captions.json` → `Caption[]`).

### 06.03.02 `ralphy assets install-local-models` bootstraps whisper.cpp  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Verb downloads a configured whisper.cpp binary + the `large-v3-turbo` model (configurable via `--model`).
- Installs into `~/.ralphy/local-models/`.
- Idempotent.
- Sha256-verified.

### 06.03.03 Captioning accuracy parity within ±5% WER on test fixtures  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Test fixture: 10 clips with hand-labeled captions.
- Cloud whisper-1 WER and local whisper.cpp WER both within ±5% of the gold transcript.
- Test runs in CI on a runner with the local model installed.

### 06.03.04 Caption format covers what Remotion expects  [x]
**v1.0:** yes

**Acceptance criteria:**
- `Caption[]` shape matches `@remotion/captions` (already implemented).
- Verified by an existing render test.

---

## 06.04 Probe verbs

Replace ad-hoc ffprobe calls with one canonical verb each.

### 06.04.01 `ralphy video probe <path>`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Output: `{ duration_s, width, height, fps, codec, has_audio, audio_channels, bitrate, container }`.
- Works on any container ffprobe supports.
- Fails with code `E_PROBE_INVALID` on corrupt input.

### 06.04.02 `ralphy audio probe <path>`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Output: `{ duration_s, sample_rate, channels, codec, lufs_integrated, peak_dbfs }`.
- LUFS measured via ffmpeg `loudnorm` analysis pass.

### 06.04.03 `ralphy video frame <input> --at <sec>`  [~]
**v1.0:** yes

**Acceptance criteria:**
- Extracts a single frame, writes PNG (or JPEG with `--format jpeg`).
- `--at <sec>` accepts decimal seconds or `HH:MM:SS.mmm`.
- `--count N --interval <sec>` extracts a sequence.

---

## 06.05 Local-model architecture (post-launch foundation)

Even if we don't ship local llama for v1.0, the architecture for "local model registry" should be in place so future additions are routine.

### 06.05.01 `cli/lib/local/registry.ts` lists installed local models  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Registry file: `~/.ralphy/local-models/registry.json`.
- Lists installed models with kind (`captioning`, `llm`, `embedding`), backend (`whisper.cpp`, `llama.cpp`), path, sha256.
- `ralphy local list` shows the table.

### 06.05.02 `ralphy local install <kind>/<model>` is the entry-point  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Mirrors `ralphy assets install` shape — declarative, idempotent, verified.
- Documented in `docs/local-models.md`.

### 06.05.03 `ralphy bench local` compares local vs cloud  [ ]
**v1.0:** no

**Acceptance criteria:**
- Runs a fixed benchmark (10 clips, 10 transcripts) on each installed backend.
- Reports wall-time, cost, WER vs gold.

---

## 06.06 Post-launch utilities

### 06.06.01 Palette extraction  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy video palette <input>` returns top-5 colors + a Mondrian visualization PNG.
- Used by `clone` (palette transfer for templates).

### 06.06.02 Format conversion verbs  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy image convert --from png --to webp`, etc.
- Covers the common conversions Ralphy needs internally.

### 06.06.03 Local LLM for VO line cleanup  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy text trim-vo <input> --model local/llama-3.1-8b-q4` runs a tiny offline pass to tighten a VO line within syllable budget.
