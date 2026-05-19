# Model stack — Tokyo Y2K Cinematic Near-Miss

Crystallized from `workspace/projects/tokyo-y2k-001/logs/generations.jsonl` (91 entries) + postmortem `04-models-and-cost.md`.

## Cost ballpark (full pass, 15-17 clips, 75s)

| Phase | Items | Model | Logged $ | Notes |
|---|---|---|---:|---|
| Image anchors — initial pass | 15-17 | `google/gemini-3-pro-image-preview` ($0.15/call) OR `openai/gpt-5.4-image-2` ($0.20/call) | ~$3-5 | Always pass character-master refs inline |
| Image anchors — register-pivot regen (e.g. v1→v2 90s-film) | 15-17 | same | ~$3-5 | Budget for ONE register-pivot regen pass — anchor v1 rarely lands the grade on first try |
| Image anchors — targeted v3 fixes (anti-frame, anatomy, glasses) | 2-6 | same | ~$0.50-1.50 | Per-shot regens, not full batches |
| Video i2v — main pass | 15-17 | `kwaivgi/kling-v3.0-pro` ($0.70/call) | ~$10-12 | Add 2-4 errored calls if any seedance face-anchor attempts (those cost $0) |
| Video i2v — phantom-limb / motion regens | 2-4 | same | ~$1.50-2.80 | Per-shot regens for anatomy / motion failures |
| Music — main + 3 variants | 4 | `elevenlabs/eleven_music_v1` | $0 | Free-tier as of source-project session. Plus 1 retry after 429 if you fan-out 3 parallel |
| Trim analysis | 15-17 | `google/gemini-3.1-pro-preview` via `ralphy ref analyze-video` | ~$1-3 est | NOT logged in generations.jsonl currently — see [tokyo-y2k-001 postmortem 03-cli-issues #4] |
| Render | 2 | Remotion local (`bunx remotion render` via `ralphy render`) | $0 | 9:16 + 16:9 from same scenes.ts |
| **TOTAL — minimum-viable pass** | | | **~$15-20** | If anchor v1 lands the grade |
| **TOTAL — source project actual** | | | **~$22.35** | 1.4× minimum due to v1→v2 90s-film register pivot |

Source project final spend: ~$22.35 cumulative (63 images $9.75 + 20 video gens $12.60 + music $0 + trim analysis ~$1-3 est).

## Image stage

### What worked

- **`google/gemini-3-pro-image-preview`** — held the 35mm-film register cleanest. Soft halation, subtle grain, lifted blacks (not crushed) all came through on first try when the prompt called for them explicitly. Cost: $0.15/call. **Default pick.**
- **`openai/gpt-5.4-image-2`** — slightly stronger on architectural detail + signage. Slightly more "digital crispness" on faces. Cost: $0.20/call. **Fallback for 16:9 architectural-heavy shots (platform wides, vending alley, Shibuya crossing).**

### What we tried and dropped

- **Direct text-to-image of human faces without a master ref** — drift between scenes was unacceptable. Per `feedback_super_original_refs` memory: ALWAYS lock the product + model master shots first, pass via inline ref on every per-scene anchor. The source project did this once it pivoted; the v1 anchors were drifting.

### Discovered behavior

- Anchor v1 → v2 register-pivot is **the norm, not the exception** for cinematic-short projects. Budget for one full re-pass after seeing the first batch. The source project did v1 (default register) → v2 ("hard 90s-film register, heavy Kodak Vision3 250D grain, halation, milky lifted blacks, magenta cast in shadows, cyan in highlights, NO digital sharpness") → v3 targeted ("anti-frame block + scene-10b glasses fixes"). All v1 anchors retained on disk as `.v1-pre-90s.png` per append-only invariant.

## Video stage

### What worked

- **`kwaivgi/kling-v3.0-pro`** — accepted every photoreal human face anchor on first try. Motion was clean, locked-off discipline was respected. Cost: $0.70/call. **Default for all human-anchored shots in this register.**
- **`bytedance/seedance-2.0`** — clean motion on landscape / hands-only / empty-courtyard shots (e.g. scene 03 door-swing wide, scene 08p sakura courtyard). Cost: $0.50/call. **Reserve for non-human anchors.**

### What we tried and dropped

- **`bytedance/seedance-2.0` for photoreal human face anchors** — privacy filter hard-rejects with `InputImageSensitiveContentDetected.PrivacyInformation` even when the face is AI-generated. Source project burned 4 errored calls on scene-02 before pivoting to Kling (which succeeded first try). Confirmed in `feedback_seedance_rejects_realistic_people` global memory.
- **`--audio ON` on Kling i2v** — would add diegetic train clatter / rain / shutter sounds that violate the zero-diegetic invariant. Source project explicitly set `--audio OFF` on every clip and post-mixed ElevenLabs Music separately.

### Discovered behavior

- **EVERY video clip overshoots the requested duration by ~1s (24 frames at 24fps).** Kling-v3.0-pro returns 4.04s when asked for 4s, 5.04s for 5s, 6.04s for 6s, 9.04s for 9s. Seedance-2.0 behaves identically. This is the model's silent buffer. The trim pass is therefore mandatory, not optional, when the project has a fixed-duration music bed.
- **Kling/Seedance both return 24fps natively.** Compose at 24fps to avoid resampling artifacts.

## Music stage

### What worked

- **`elevenlabs/eleven_music_v1`** — generated the WINNER bed on first try with the full-arc prompt (piano + soft strings + cello peak + strings recede). Cost: $0 (free tier).
- **Generating 3-4 variants up front** — variant A (piano-only) was too sparse for source project, variant B (koto+piano JP-accent) was charming, variant C (ambient pad) was atmospheric. User picked the main full-arc bed as final.

### What we tried and dropped

- **Fanning out 3 parallel music gens** — ElevenLabs Music has a 2-concurrent-request hard cap. One returns HTTP 429 `concurrent_limit_exceeded`. Retry-serially is fast (~15s) but pollutes `generations.jsonl` with an error row. **Always batch in groups of 2 or serialize.**

### Discovered behavior

- ElevenLabs Music ToS blocks named-artist / named-producer / named-composer references (e.g. "in the style of Ryuichi Sakamoto" → rejected). The API returns a `prompt_suggestion` ready to resubmit. Stay in genre + tempo + instrumentation + mood register only. Per `feedback_elevenlabs_music_no_artist_names` memory.

## Trim analysis stage (the missing pipeline phase)

### What worked

- **`google/gemini-3.1-pro-preview`** via `ralphy ref analyze-video <local-path>` with `--prompt-file logs/trim-prompt.md`. Strict-JSON output (no prose, no markdown fences), `jq`-able immediately. Latency ~9-15s per clip. Parallelizes at `xargs -P 6` with no rate-limit hits. Cost ~$0.05-0.20 per clip (best-effort estimate — not currently logged in `generations.jsonl`).

### Discovered behavior

- Gemini *rounds `observed_duration_sec` to nearest integer* in its JSON output — ignores the 0.04s offset on the model's overshoot. Don't trust gemini's duration field for timing-precise work. Use ffprobe for exact durations; use gemini only for *relative timestamps within the clip* (`t_start: 1.5, t_end: 5.0` of `best_subwindow`).

## Render stage

### What worked

- **Remotion local** via `bunx remotion render` (called through `ralphy render <id>`). Latency: 83s for 1800 frames at 4× concurrency on M-series Mac (9:16); 108s for 1800 frames at 4× concurrency (16:9). Cost: $0.

### What we tried and dropped

- **Trying to render without `composition-props.json`** — hard-fails with misleading "*author the composition first*" error. Always stub `{"compositionId":"<X>"}` first.
- **`STATIC_ROOT = "<id>"` (bare-id convention)** — copy-pasted from `src/videos/playdate-pixel-001/`. `ralphy render` materializes `public/project-<id>` symlink, NOT `public/<id>`. Use `STATIC_ROOT = "project-<id>"` and drop the `assets/` prefix from `staticFile()` paths.
