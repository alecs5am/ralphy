# Noski Deadpan 2-Hander — vibe style

**Genre:** deadpan-philosophical TikTok 2-hander in the @americanbaron register.
**Length:** 60-90s (default 73-75s), ~24-36 micro-scenes averaging 2.2s each.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920. English VO via Kling `--audio` (canonical); non-English via ElevenLabs post-mix.
**Validated example:** `workspace/projects/noski-people-001/` — 73.9s, 32 scenes, $23.15 total, user-rated 8/10.

> **Reference-required gate.** If the brief names a specific real creator's handle (e.g. `@americanbaron`), or asks for a named persona, a reference (the source video / a photo of the persona) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised personae from text alone lose the deadpan register within one clip — voice profile, posture grammar, and delivery cadence all need to be locked to a concrete reference. Override is allowed only with explicit `"generate without reference, I understand the quality will be worse"`; logged as `stage: "no-ref-consent"`.

## Why this works

1. **Two static bodies + one micro-movement per clip = the whole format.** No camera movement, no posture change, no head turn. The eye locks onto the seated head-back posture as a frame, and every clip's value is in the *voice* and the *line*. Cheap to produce, hard to scroll past.
2. **Half-rhetorical questions invite projection.** "Socks or people — what gets lost more often?" doesn't ask for an answer; it asks the viewer to start one. The piece sustains attention through 32 micro-beats because every beat is a tiny re-engagement.
3. **Location lock + voice profile lock = consistency across 30+ separated generations.** Without these two locks, scene-to-scene drift (different couch, different voice age, different accent) destroys the long-form-from-cuts illusion. With them, 32 Kling clips read as one continuous take.
4. **Lofi cafe music at -22 LUFS under almost-whispered VO carries the contemplative register.** Anything more energetic flips the piece from philosophy to vlog. Anything more silent flips it from contemplation to ASMR.

## Key rules (top 7 from the source project's lessons learned)

1. **Generate a `location-master-plate` as anchor #1, BEFORE any character scene anchor.** It's a wide establishing shot showing the room + props + lighting + both characters seated head-back in their canonical positions. Every subsequent scene anchor must pass this plate as `--ref` alongside the relevant character master. Skipping this rule reliably produces "3 different couches in 3 supposedly-same-room scenes" — caught in the source project at turn 8, cost ~$0.45 + 30 min user-correction loop.
2. **Confirm `target_language` BEFORE choosing the audio pipeline.** Chat language ≠ video language. UGC creators often produce in EN for global reach even when speaking RU/UA in chat. EN target → Kling `--audio` (canonical per MODELS.md). Non-EN target → Kling `--audio` is unsafe (accent slip, voice age drift); use ElevenLabs `eleven_multilingual_v2` post-mix instead.
3. **Anatomy checklist before accepting any character anchor.** For every generated image with a person: (a) hips on seat? (b) back against back-cushion, not pressed *through* it? (c) knees forward, feet on floor? (d) head connects to torso through a real neck, tilt is physically possible? (e) if two people, do their hips/shoulders/heads occupy distinct space? (f) if "eyes open" was prompted, are pupils plainly visible? Photoreal models still produce broken seated poses; explicit anatomy chain in the prompt is mandatory.
4. **Strongest angles for head-back posture are strict side-profile and strict top-down.** Three-quarter-front with "head fully tipped back" is a contradiction the model resolves by giving up on head-back (subjects end up upright with eyes-up). Skip frontquarter close-ups for this format.
5. **Eyes-open is a positive cue, not a negative ban.** Negative prompts like "no eyes closed, sleeping, meditating" don't reliably suppress closed-eye outputs (~30-40% failure). Explicit positive cues — `"WIDE OPEN eyes, irises clearly visible, pupils centered looking up at the camera lens"` — beat the ban list every time.
6. **Voice profile block + "Same voice as earlier scenes." in every Kling prompt produces cross-clip voice consistency.** The 7-tag block: gender, age, voice-tone (baritone/contralto), voice-texture (gravel/breathy), delivery register (deadpan-philosophical), accent (neutral American), volume (quiet/almost-whispered). 24+ separate Kling generations read as one continuous voice when each carries the verbatim block.
7. **Music must be sevenfold-banned in every Kling prompt.** Single "no music" gets ignored, especially on slow-tempo clips. The working ban: `"ABSOLUTELY NO MUSIC. NO instrumental score. NO melodic background. NO piano. NO drums. NO ambient pad. NO underscore."` Music is a SEPARATE ElevenLabs Music pass overlaid in the editor stage.

## Workflow (the pipeline a fresh agent should run)

```
1. Research                                  (5-10 min, ~$0)
   ├─ ralphy ref pull <social-url>           # the @handle reference if imitating
   ├─ ralphy ref analyze-video <slug>        # Gemini full-mp4, gets shot list
   └─ ralphy ref audio-describe <slug>       # Gemini audio, gets tone / music register

2. Scenario lock                              (10 min, $0)
   ├─ Ask user: target_language? brand/persona context?
   ├─ Ask user: cast preferences? topic preferences?
   └─ Draft scenario table (scene | dur | anchor | speaker | VO line) BEFORE any image gen.

3. Identity locks                             (5 min, ~$0.40)
   ├─ ralphy generate image --slot master-character-a-portrait --model openai/gpt-5.4-image-2
   └─ ralphy generate image --slot master-character-b-portrait --model openai/gpt-5.4-image-2
       (neutral background, no scene context — pure identity)

4. LOCATION-MASTER-PLATE                      (3 min, ~$0.15)   ← RULE 1
   └─ ralphy generate image --slot location-master-plate \
        --model google/gemini-3-pro-image-preview \
        --ref master-character-a.png --ref master-character-b.png \
        --prompt "<wide front, both characters seated head-back in the room, locking couch + rug + wall + lamp + props>"

5. Scene anchors                              (15 min parallel, ~$2-3)
   ├─ For each unique angle: ralphy generate image \
   │     --ref location-master-plate.png --ref master-character-X.png \
   │     --prompt "<scene composition + character pose + camera angle>"
   ├─ Canonical close-ups: side-profile + top-down per character (SKIP frontquarter — RULE 4)
   ├─ Generate 4-6 unique story-driven cutaway details (objects + textures)
   └─ Self-verify each: identity match + location match + anatomy correct (rule 3) + eyes open (rule 5)

6. Voice profile test                         (3 min, ~$0.85)   ← RULE 6
   ├─ Pick one Speaker A dialog scene + one Speaker B dialog scene.
   ├─ Run Kling 3s test clips with full voice profile blocks.
   ├─ Scribe-transcribe each → confirm text + voice character.
   └─ Only proceed to batch generation after both Speakers validate.

7. Batch Kling video                          (10-20 min, ~$15-20)
   ├─ For each scene: ralphy generate video \
   │     --first-frame <anchor.png> --duration 3-5 --audio \
   │     --prompt "<voice profile block + VO line + static-camera + sevenfold-no-music>"
   ├─ Use ABSOLUTE paths for --first-frame (cwd-drift bug, source-project turn 14)
   ├─ ffprobe each output clip's real duration (RULE in editor below)
   └─ Scribe each dialog clip → save speech timing per scene to JSON

8. Music bed                                  (3 min, ~$0)
   ├─ ralphy generate music --slot bed-v1 --duration <total+5s> \
   │     --prompt "<lofi cafe genre + tempo + LUFS + instrumentation ban list>"
   └─ Avoid naming specific artists in prompts (ElevenLabs ToS)

9. Compose                                    (5 min, ~$0)
   ├─ Per-clip trim using Scribe word timestamps:
   │     trim_start = first_word_start_ms - 250ms
   │     trim_dur   = (last_word_end_ms - trim_start) + 350ms
   ├─ 50ms audio fade in/out on each clip BEFORE concat (kills the AAC click bug)
   ├─ Concat with ffmpeg -f concat (RE-ENCODE, not -c copy)
   ├─ Mix music at -18dB under VO with optional sidechain ducking
   └─ Final mp4 ~70-75s for a 32-scene deadpan piece

10. Review + iterate                          (~$0 per cycle)
    ├─ Show user the v1 mix.
    ├─ Flag-driven regen: only the failing scenes get new Kling clips.
    └─ Keep all old assets — append-only (AGENTS.md invariant #13)
```

**At 1.5× minimum-viable**, total spend ≈ $22-25 for a 73s 32-scene piece. Following rules 1, 6, 7 brings it down to ~$18-19.

## Beat structure (the default 32-scene shape)

```
0-3s     → Establishing wide (location-master-plate). Both seated head-back, no dialog.
3-8s     → Hook line, Speaker A or B (whichever is the "asker"). One question.
8-65s    → Alternating dialog micro-scenes. ~26 beats × 2.2s avg.
             - Each beat: ONE line, one speaker, lips move, body still.
             - 4-6 silent cutaway details interspersed (sock on rug, hand on knee,
               curtain light, dust motes, framed photo on sideboard, ticking clock).
             - Mix camera angles: side-profile, top-down, occasional wide two-shot.
65-73s   → Top-down two-speaker finale (RULE 9 — single 5s Kling clip with timed
             dialog segments, both speakers in one shot).
73-75s   → Final silent beat held — both still, both looking up, fade out.
```

Match cuts to the rhythm of the reference, don't try to standardize. Some long lines stretch to 5s, some "...Both" beats squeeze to 1.5s.

## Required inputs (slot table)

| Slot | What it is | Example value from source project |
|---|---|---|
| `{{character_a}}` | Speaker A visual descriptor + identity quirks | "Black man, late 20s, shoulder-length thin natural locs, thin gold wire-rim eyeglasses, chocolate-brown merino turtleneck, small silver pinky ring on right hand" |
| `{{character_a_voice}}` | Speaker A 7-tag voice profile block | "soft warm baritone voice with slight gravel, deadpan philosophical delivery, neutral American accent, quiet contemplative volume, almost-whispered register" |
| `{{character_b}}` | Speaker B visual descriptor + identity quirks | "Freckled red-haired young woman, mid-20s, lavender-tipped copper hair, slight overbite, cream-and-mustard cable-knit cardigan over white t-shirt, dense freckles" |
| `{{character_b_voice}}` | Speaker B 7-tag voice profile block | "soft contralto voice, slight breathy quality, deadpan philosophical delivery, neutral American accent, slight overbite affecting sibilants, quiet contemplative volume" |
| `{{location_master_plate}}` | Room + couch + props + lighting description for the establishing shot | "cream boucle modular three-seat couch with one continuous low back-cushion ridge, dusty-pink matte wall, vintage Persian rug in faded reds and rust-blues, dark walnut sideboard with handmade stoneware vessels, opal-glass pendant lamp, soft north-window daylight from camera-left" |
| `{{target_language}}` | Target audience language (drives audio pipeline choice) | "English" (canonical — Kling `--audio`). For RU/UA/etc → Kling `--audio` off, ElevenLabs post-mix. |
| `{{topic_seed}}` | The half-rhetorical question that drives the piece | "Socks or people — what gets lost more often?" |
| `{{reference_style_handle}}` | (Optional) the @handle being imitated, for research only | "@americanbaron — 'Do more things exist or not exist?'" |

## Anti-patterns (do NOT)

- **DO NOT skip the location-master-plate** to save $0.15. You will burn $0.45 + 30 min regen instead. (Source project rule 1 / fix #2.)
- **DO NOT default to the user's chat language** for the audio pipeline. Always confirm `target_language` first. (Source project rule 2 / fix #1.)
- **DO NOT trust negative prompts to suppress closed eyes.** Use explicit positive cues with iris color + pupil position. (Source project rule 4.)
- **DO NOT prompt three-quarter-front + head-fully-back close-ups.** Compositionally impossible — fall back to strict side-profile or strict top-down. (Source project rule 5.)
- **DO NOT hardcode clip durations in trim scripts.** Always `ffprobe` real duration first; encoder overshoot will silently cut speech. (Source project rule 7 / fix #4.)
- **DO NOT use `ffmpeg -f concat -c copy` on Kling clips.** AAC stream-boundary clicks will haunt every transition. Re-encode each clip with 50ms audio fade in/out first. (Source project rule 8 / fix #5.)
- **DO NOT name artists in the ElevenLabs Music prompt** ("like Brian Eno", "in the style of J Dilla"). ToS rejection. Use genre + tempo + instrumentation + LUFS. (Source project pitfall row.)
- **DO NOT use a single "no music" line in Kling prompts.** Use the sevenfold ban (see rule 7). Single ban gets ignored on slow-tempo clips.
- **DO NOT push more than 2 alternating speakers into one Kling clip.** Lip-sync gets fuzzy. 2 alternating speakers in a 5s finale shot is the validated limit.
- **DO NOT improvise a brand or named real creator from text alone.** Reference-required gate applies (AGENTS.md hard rule #3).

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Master portraits | 2 × `openai/gpt-5.4-image-2` @ $0.20 | $0.40 |
| Location-master-plate | 1 × `google/gemini-3-pro-image-preview` @ $0.15 | $0.15 |
| Scene anchors (canonical close-ups + details + alts) | 14-18 × `google/gemini-3-pro-image-preview` @ $0.15 | $2.10 - $2.70 |
| Kling video clips | 24-36 × `kwaivgi/kling-v3.0-pro` × 3-5s @ $0.14/s | $10 - $20 |
| Music bed | 1 × `elevenlabs/music_v1` (subscription, no per-call cost) | $0 |
| Captions / Scribe | ~30-50 calls (every dialog clip, possibly 2× across iterations) | ~$0.01 |
| Render | local ffmpeg | $0 |
| **Total** | | **~$13 - $25** |

Source-project validated cost: $23.15 at 1.8× minimum-viable. Tight execution lands at ~$18-19.

## Read also

- `hooks.md` — opening-beat patterns (0-3s) for the deadpan register.
- `prompt-cookbook.md` — verbatim prompt patterns for each stage (image / video / music) with `{{slots}}`.
- `model-stack.md` — stage-by-stage model picks + params + what worked / what to avoid.
- `examples.md` — two worked variant prompts showing how the template generalizes.
- `README.md` — one-screen "how to use this template" + cost ballpark.
