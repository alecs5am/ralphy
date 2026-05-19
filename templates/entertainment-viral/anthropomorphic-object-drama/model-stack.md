# Model stack — Anthropomorphic Object Drama

Reconstructed from `workspace/projects/fruit-drama-001/logs/generations.jsonl` (25 entries, $37.20 total). No postmortem available for the source, so model choices are derived from gen-log mode picks + observed cost-of-failure (rev1 → rev2 → rev3 chains).

## Per-stage defaults

| Stage | Model | Endpoint | Provider | Notes |
|---|---|---|---|---|
| Keyframes (images) | `google/gemini-3-pro-image-preview` | OpenRouter | Google | One keyframe per scene. ~$0.15/call. Used 8 calls in source (one regen on scene-02 to tweak look). |
| Video (i2v + native audio) | `google/veo-3.1` | OpenRouter | Google | 8s clip with native audio ON. ~$4/clip. First-frame anchor = the matching keyframe. |
| Voiceover | NONE separately | — | — | Veo native audio IS the on-camera dialogue. Do not stack ElevenLabs TTS. |
| Music | `elevenlabs/music` | ElevenLabs direct | ElevenLabs | One continuous bed (~56s) with internal arc. Source call logged $0 (free-tier credits at the time) — typical cost ~$0.20–0.50 depending on length. |
| Captions (word-level) | `elevenlabs/scribe_v1` | ElevenLabs | ElevenLabs | Word-level timestamps on the final mixed audio. ~$0.001–0.004/run. Source used 3 calls ($0.005 total). |
| Concat / mix / burn | ffmpeg recipes | local | — | `concat-lossless`, `sidechain-compress`, `burn-subtitles`. No model cost. |

## Cost per stage (from source project)

| Stage | Calls | Cost |
|---|---|---|
| Keyframes (gemini-3-pro-image-preview) | 8 | $1.20 |
| Videos (veo-3.1) | 9 (includes 2 rev-iterations on scene-01) | $36.00 |
| Music (elevenlabs/music) | 1 | $0.00 (free-tier at the time) |
| Captions (scribe_v1) | 3 | $0.005 |
| ffmpeg (concat / mix / subtitles) | 4 | $0.00 |
| **Total** | **25** | **$37.20** |

Round-number ballpark for a fresh 7-beat run with no re-rolls: **~$30**. Plan for **~$40** if you expect 1–2 video re-rolls (likely on scene-01 to dial in the vibe — see "Smoke-test first" below).

## What worked

- **Veo 3.1 with `--audio` ON, English dialogue** — clean lip-synced on-camera speech, validated path per `MODELS.md`.
- **Gemini-3-pro-image-preview keyframes as Veo first-frame anchors** — locks character look across the 8s clip much better than text-only Veo prompts.
- **Scene-01 doubles as cast-lineup master** — both leads in the same frame; later keyframes reuse the lock_string text + the visual cue of "same characters as scene-01".
- **Single continuous music bed with internal arc** — one ElevenLabs Music call, not two stems. The "swell at 32s" hint inside the prompt actually produces the swell.
- **Sidechain-compress music under VO** — preserves dialogue intelligibility without manual ducking.
- **Captions burned in editor stage** (Inter 900 white + black stroke) — Veo can't render cyrillic in-clip; the source had Russian baked-captions per scene so the burn was load-bearing.

## What we tried and dropped

From the gen-log re-roll pattern:

- **Scene-01 rev1** — "smoke-test scene-01 — vibe-check RU native Veo audio + character look" ($4). Verified the Pixar-3D fruit look works in Veo but flagged the RU audio drift.
- **Scene-01 rev2** — "rev2 — on-camera dialogue both characters, no narrator" ($4). Dropped a narrator-style framing; pinned on-camera lip-synced dialogue.
- **Scene-01 rev3** — "rev3 — EN dialogue" ($4). Switched RU → EN per `production_notes.audio_consent` in `scenario.json`. EN is the kept variant; per `MODELS.md` Veo native EN audio is the validated-clean path.

**Net cost of the scene-01 dial-in: $12** (3 × $4 Veo clips). Plan for this. The "smoke-test scene-01 first, only commit to all 7 after the vibe-check" workflow is what kept it bounded; without it, drifting on all 7 scenes at once would have multiplied this.

## What to avoid

- **Russian Veo audio without explicit user confirmation.** Veo native EN audio is validated-clean; RU drifts on accent + voice-age stability (per `MODELS.md` + the `feedback_kling_no_ru_audio` memory note for analogous Kling-vs-RU experience).
- **Cyrillic captions inside Veo prompts.** Veo mangles in-clip cyrillic. Burn captions in the editor stage only.
- **Stacking ElevenLabs TTS on top of Veo native audio.** Lip-sync desyncs immediately; this is what `production_notes` in the source project explicitly bans.
- **Two music stems.** One bed with internal arc. ffmpeg cross-fading two stems leaves an audible seam at the cut.
- **Not restating character lock_strings in every Veo prompt.** Veo has no character-lock primitive. The source restates every character's full ~80-word lock_string in every video prompt — that's why characters stay on-model.
- **Asking Veo for background music in-clip.** Every Veo prompt must explicitly ban music ("no music, no background score, ambient diegetic only"). Two music sources (Veo's + ElevenLabs') = mud.

## Composition note (no generic Remotion shipped)

This is a `vibe-style` template — it does NOT ship a generic Remotion composition. The source project (`fruit-drama-001`) authored its own composition at `src/videos/fruit-drama-001/index.tsx`, hardcoded to 7 beats of 8s each. Consumers of this template will hand-author their own `src/videos/<new-id>/` Remotion file. The structure is straightforward:

1. `<OffthreadVideo src={concat.mp4} />` — full-bleed video layer
2. `<Audio src={music-bed.mp3} volume={0.35} />` — music underlay, sidechain-compressed under VO in the audio mix
3. `<PopWordCaptions captions={captions.json} font="Inter 900" />` — popping-word overlay

If a future iteration generalizes this composition into `src/lib/templates/AnthropomorphicObjectDrama.tsx`, this template can be upgraded to `vibe-reference` with a `compositionTemplate.id` field.
