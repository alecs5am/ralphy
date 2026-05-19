# Model stack — Comic Spider-Verse Action

## At-a-glance

| Stage | Default model | Endpoint | Why this one | Cost / call |
|---|---|---|---|---|
| Image — VS poster (OPTIONAL) | `google/gemini-3-pro-image-preview` | OpenRouter | Materially stronger at multi-ref layout replication. Source project: matched user's VS-poster layout 1:1 in 46s. | $0.15 |
| Image — no-ref style exploration | `openai/gpt-5.4-image-2` | OpenRouter | Default per MODELS.md, only when no layout ref is supplied. Slower + more expensive than gemini on ref work. | $0.20 |
| Video — both clips | `bytedance/seedance-2.0` | OpenRouter | **Only viable choice** for non-default physics motion (kickflip, ollie, grind, board-flip). Per user memory `feedback_vg_model_picks`: kling is only for default UGC selfie motion. Sharp action, painterly style holds, AAC audio returned with `--audio`. | $2.10 (15s @ 1080p) |
| Music bed | `elevenlabs/music_v1` | ElevenLabs direct | Flat-rate subscription. Handles named soundtracks + older artists; rejects modern rap names. | $0 (subscription) |
| Mix (concat + add-music --duck) | `ffmpeg` | local | `ralphy video concat` + `ralphy video add-music --duck` cover the entire post pipeline. | $0 |

## What worked

### `bytedance/seedance-2.0` for action physics

- **Sharp motion** on kickflip / ollie / grind / board-flip — kling's selfie-tuned motion would smear these.
- **`--audio` flag works despite CLI help saying "Veo 3 only"** — confirmed empirically: 15s seedance clip returned with AAC SFX track when `--audio` was set and an AUDIO POLICY block in the prompt banned music.
- **Stylized cartoon t2v bypasses the privacy filter** that blocks photoreal human i2v anchors. Pure t2v with painterly character descriptions is the path.
- **Per-clip billing $2.10 for 15s @ 1080p 16:9** with `--audio` ON. Cost matches `cli/lib/providers/media.ts:VIDEO_PRICE_PER_SEC` × duration.

### `google/gemini-3-pro-image-preview` for ref-anchored layout

- **46s response vs 196s for gpt-5.4-image-2 on the same layout**. 4× faster.
- **$0.15 vs $0.20 per call** — cheaper too.
- **1:1 layout replication** on the user's VS-poster reference (name treatment, VS badge, stat blocks, faded letterforms, sidebar grid all matched). gpt-5.4 on v1 with no ref produced a generic skatepark scene that loosely interpreted "character lineup".
- **Pass the user's reference as `--ref`**. Always reach for gemini when the user drops a layout reference.

### `elevenlabs/music_v1` for post-render music bed

- **Flat-rate subscription** — variants cost $0.
- **Older artist references + named soundtracks pass** (Goldfinger, Distillers, Beastie Boys, Run-DMC, Linkin Park, Tony-Hawk-Pro-Skater soundtrack).
- **Honors outro descriptions** — "fade into a single crashing cymbal hit" produces a usable tail for the editor.
- **Tempo + production cues over genre alone** narrows the model. "Skate-punk / hip-hop fusion 110 BPM, palm-mute electric-guitar against hard boom-bap" + production-level kick/snare descriptions produced the winner bed.

## What we tried and dropped

| Model | Use case | Why dropped | Cost burned |
|---|---|---|---|
| `openai/gpt-5.4-image-2` (no ref) | First-pass character-lineup | No ref → generic skatepark scene, loose layout interpretation. Slow (196s). Swapped to gemini + ref. | $0.20 |
| `bytedance/seedance-2.0` standalone duel clip | Single 15s self-contained scene | User pivoted to a 2-clip stitched format on turn 6 after seeing v1 — the standalone clip was abandoned. Append-only kept it on disk. Lock the cut structure (1 clip vs N clips) BEFORE the first seedance call. | $2.10 |
| `elevenlabs/music_v1` with modern rap artist names | Music prompt v2 (drill) + v3 (g-funk) | HTTP 400 `bad_prompt` — ScHoolboy Q, Pop Smoke, Dr. Dre, Snoop, DOM Kennedy, Larry June all rejected. ~10 min lost to re-prompting. | $0 (subscription) |
| `--audio` declined on seedance (almost) | Was about to silent-render and post-mix | CLI help text "Veo 3 only" is wrong — code passes `generate_audio: true` unconditionally. User pulled me back. | nearly $2.10 (would have been a 2nd render) |

## Models specifically NOT to use

- **`kwaivgi/kling-v3.0-pro` for any non-default physics action.** Kling is tuned for default UGC selfie motion (talking head, light gesture). Kickflip / ollie / grind / board-flip / aerial rotation / chase scenes all smear or default-pose on kling. Use seedance-2.0 for any motion outside the UGC default lane. (Per user memory `feedback_vg_model_picks_001`.)
- **`bytedance/seedance-2.0` with a photoreal-human i2v anchor.** The privacy filter blocks it even when the anchor is AI-generated. Pure t2v works. (Per user memory `feedback_seedance_rejects_realistic_people` — but ONLY for photoreal-i2v-anchor scope; stylized/cartoon/painterly t2v is fine.)
- **`google/veo-3.1` for this template.** ~$0.50/sec vs seedance's $0.14/sec. 5-6× more expensive for no measurable quality gain on stylized painterly action. Veo's strength is photoreal cinematography, not painterly comic-book.

## Cost per stage (minimum viable)

```
Image (skipped)                                 $0.00
Video clip 1 (seedance 15s @ 1080p --audio)     $2.10
Video clip 2 (seedance 15s @ 1080p --audio)     $2.10
ffmpeg trim + concat                            $0.00
Music (ElevenLabs subscription)                 $0.00
ffmpeg add-music --duck                         $0.00
                                              ────────
                                                $4.20
```

With 3 music variants for A/B/C + 1 VS poster: $4.35. Source project actual: $6.65 (one unused $2.10 duel clip + $0.35 poster iteration cost).

## Cost — what to budget for "rules followed perfectly"

- 1 seedance clip per cut beat: $2.10 × 2 = $4.20
- 1 music bed: $0 (subscription)
- 0 marketing-card poster: skip unless explicitly requested
- 0 i2v anchor: skip per kind-decision (animated style + cartoon characters)
- 0 sunk retries: don't name modern rappers in music prompts

**Floor: $4.20 per project.** Add $0.15 for a VS poster if shipping a marketing card alongside the cut.

## Discovered model breakage (P0–P1 for MODELS.md)

1. **`bytedance/seedance-2.0` privacy filter does NOT block stylized cartoon t2v** — the filter only blocks photoreal-human i2v ANCHORS. The user memory `feedback_seedance_rejects_realistic_people` should be tightened to make this scope explicit.
2. **`elevenlabs/music_v1` ToS rejects modern recording artist names**, especially current rappers (ScHoolboy Q, Pop Smoke, Dr. Dre, Snoop, DOM Kennedy, Larry June). Returns HTTP 400 `bad_prompt` with `detail.data.prompt_suggestion` containing a clean rewrite ready to resubmit. MODELS.md § Music generation needs a "Prompt content policy" subsection.
3. **`ralphy generate video --dry-run` reports a stale $0.10/sec for seedance**; actual billing is $0.14/sec. ~40% under-estimate. Verify dry-run rates before quoting a project budget.
4. **CLI help text `--audio` "Veo 3 only" is wrong** — code passes `generate_audio: true` unconditionally to any video model. The flag works on seedance and likely all OpenRouter video models. Help text needs to be corrected to "Veo 3 / Seedance 2 / Kling 3 — EN only, see MODELS.md".

## Notes on `--audio` semantics

When seedance is called with `--audio` AND the prompt contains a 5-line AUDIO POLICY block banning music, the returned AAC track is **SFX-dominant** with diegetic on-camera sound (wheels, pop-tail, ollie whoosh, breathing, city ambient) and no music. This is the basis for the post-render sidechain duck — the audio track is treated as the SFX bus and the music bed is sidechain'd by it.

Without the AUDIO POLICY block, seedance frequently invents background music inside the clip and the post-mix doubles up. The 5-line ban is non-negotiable.
