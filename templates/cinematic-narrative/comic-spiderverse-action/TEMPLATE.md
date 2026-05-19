# Comic Spider-Verse Action

A 27-second 16:9 painterly action scene rendered in a **comic-panel split + halftone dot bleed + ink-stroke caption** aesthetic. Two stylized characters mid-action over an urban backdrop, captured as **2 stitched seedance-2.0 t2v clips** with diegetic-only audio, then mixed with a post-render ElevenLabs music bed using sidechain duck under the SFX. Inspired by Across the Spider-Verse / Arcane painterly grammar without copying a single frame.

The template is **video-first** — no Remotion composition, no VO lane, no caption overlay layer. The painterly style + comic SFX text + halftone bleed all live INSIDE the seedance frames; the ffmpeg pipeline only stitches and mixes.

## Vibe

Two characters with **contrasting silhouettes** (height delta, hair-silhouette delta, palette delta) trade tricks across an **urban location** at a specific time-of-day. The action archetype is a duel / line / chase that resolves in a **rolling-out exit** to the next location — and continuity to the next clip is hand-engineered in the prompt text (matching sky + lighting + silhouette phrasing), NOT via i2v frame anchoring.

The frame language is **Spider-Verse Across-the-Spider-Verse meets Arcane (Netflix)**: large summarized flat color blocks, hard-edge brush strokes, painterly gouache texture, chunky variable-weight ink linework outlining characters, halftone dot patterns in mid-shadows, subtle chromatic-aberration RGB offset on bright edges, visible canvas grain. Heavy directional shadows in **deep saturated tones** (cobalt blue, deep magenta, ink-black) instead of grey. Highlights as crisp painted shapes. Comic-panel SFX text (KRRRACK / SLAM / POP / FWIP) painted directly into impact frames.

The soundtrack is **diegetic-only inside seedance**, then **music in post** — never inside the model. Sidechain duck the music under SFX so urethane scrapes and ollie pops punch through.

## Key rules (lifted from `postmortem/02-lessons.md`)

1. **Pure t2v with detailed character descriptions — skip i2v anchors.** Seedance-2.0's privacy filter only blocks photoreal i2v ANCHORS. Stylized cartoon / painterly characters bypass the filter cleanly. A VS character-card poster as a frame-anchor would corrupt anyway because its baked-in typography ends up in the video frame. Cost: $0.35 + 4 min saved per project.
2. **Believe the code, not the help text.** The `--audio` flag passes `generate_audio: true` unconditionally to any video model. Seedance returns h264+AAC when `--audio` is set, even though CLI help says "Veo 3 only". Always verify gate claims at the provider call level before declining a feature.
3. **NEVER name real recording artists in music prompts.** ElevenLabs Music ToS rejects prompts that name current rappers (ScHoolboy Q / Pop Smoke / Dr. Dre / Snoop / DOM Kennedy / Larry June all 400'd in source project). Describe via genre + tempo + instrumentation + production cues only. On rejection, the API returns `detail.data.prompt_suggestion` — pipe it back verbatim.
4. **For ref-anchored layout work, gemini-3-pro-image-preview beats gpt-5.4-image-2.** Source project: gemini matched the VS-poster layout 1:1 in 46s for $0.15 vs gpt-5.4's 196s for $0.20 (and a layout miss). Always reach for gemini when the user drops a layout reference.
5. **Sidechain duck > flat amix when music + diegetic SFX coexist.** `ralphy video add-music --duck --duck-threshold 0.04 --duck-ratio 6` gives music ~250ms recovery after each SFX hit — musically right at 110 BPM (one half-beat). Heavier ratio pumps the music; lighter doesn't duck enough.
6. **Hand-engineer continuity between clips in the PROMPTS, not via frame anchors.** Match sky color, time-of-day phrasing, palm/silhouette description, and painterly style descriptor verbatim across both clip prompts. Far cheaper and more reliable than seedance last_frame → first_frame anchoring for stylized work.
7. **`--audio` ON + AUDIO POLICY block banning music inside the prompt = SFX-dominant audio track returned by seedance.** The audio is then attenuated to 0.85 under the post-render music bed via add-music --duck. Without the AUDIO POLICY block, seedance frequently invents music inside the clip and the post-mix doubles up.

## Workflow (the pipeline I would run from scratch)

```
1. Brief locked + project create                                    (2 min)
   ralphy project create --id <slug> --name "..." --aspect-ratio 16:9 --duration 27

2. (OPTIONAL) Style reference pull                                  (3 min)
   - If the user drops a VS-poster reference from macOS NSIRD path,
     IMMEDIATELY copy to workspace/projects/<id>/refs/ — those temp paths evaporate.
   - ralphy project log-asset --kind screenshot --source ... --dest refs/...

3. Character + scene prompts authored                              (10 min)
   - For EACH clip: SUBJECTS / ENVIRONMENT / AUDIO POLICY / STYLE / SHOT 1..5 structure
   - Hand-engineer clip-1-end ↔ clip-2-open continuity in prompt text
   - CHARACTERS described in EVERY clip's SUBJECTS block — no anchor image needed

4. SKIP character-lineup image                                     (saves $0.35 + 4 min)
   Only generate a VS poster if the user explicitly wants a marketing card.
   The seedance prompt holds the character description on its own.

5. Generate clips in parallel via run_in_background                (5-7 min wall clock)
   ralphy generate video --project <id> --slot scene-clip-1 \
     --prompt @clip-1.txt --model bytedance/seedance-2.0 \
     --duration 15 --aspect-ratio 16:9 --resolution 1080p --audio
   (same again for clip 2)
   Cost: $2.10 per 15s clip × 2 = $4.20

6. Trim + concat                                                   (1 min)
   ralphy video extract-segment --in clip-1.mp4 --out clip-1.trim.mp4 \
     --start 0 --end 12         # leave 3s overlap for clip 2 opening
   ralphy video concat --files clip-1.trim.mp4,clip-2.mp4 --out render/cut-v1.mp4

7. Music gen — GENRE/TEMPO/INSTRUMENTATION ONLY                    (1 min)
   ralphy generate music --project <id> --slot bed-v1 \
     --duration 30                # 27s video + 3s tail headroom
     --prompt "<NO artist names; genre + BPM + production cues>"
   If 400 bad_prompt: parse error.detail.data.prompt_suggestion and retry

8. Mix with duck                                                   (1 min)
   ralphy video add-music --in render/cut-v1.mp4 --music bed-v1.mp3 \
     --out render/cut-v1-ducked.mp4 \
     --music-vol 1.0 --sfx-vol 0.85 --fade-out 1.5 \
     --duck --duck-threshold 0.04 --duck-ratio 6

9. User picks winner; iterate music if needed                      (5 min per variant)
   Same verb, different bed file. Each variant ~$0 (ElevenLabs subscription)
   + ~700ms ffmpeg.
```

At 1.5× minimum iterations, total spend ≈ **$4.20–$6.50** per project.

## Beat structure

Two clips, 5 shots each, 3s per shot.

| Clip | Shot | ~Duration | Beat | Camera grammar |
|---|---|---|---|---|
| 1 | 1 | 3s | Action setup — characters establish themselves in the urban location | Medium tracking 35mm, low-angle |
| 1 | 2 | 3s | First trade — A executes a signature, B answers | Side tracking 50mm, horizontal sweep |
| 1 | 3 | 3s | Escalation — synchronized airborne / impact beat with painted SFX text | Low-angle hero 24mm, ground-level |
| 1 | 4 | 3s | Trick montage — rapid alternating shots with comic-panel impact flashes | Wide tracking 28mm |
| 1 | 5 | 3s | Rolling-out exit — A and B leave the location toward the next environment | Wide backward dolly 28mm |
| 2 | 1 | 3s | Continuity — characters arrive in the new environment (sky / lighting / silhouettes match clip 1's exit) | Wide low-angle tracking 28mm |
| 2 | 2 | 3s | Side-by-side action through the new location | Side medium 50mm, horizontal tracking |
| 2 | 3 | 3s | Hero shot toward camera with sun flare / silhouette | Low-angle hero 24mm |
| 2 | 4 | 3s | Environmental interaction — grind / ollie / vault over a location-specific obstacle | Side tracking 35mm |
| 2 | 5 | 3s | Receding wide — characters ride away from camera into the horizon, hold on the receding silhouettes | Wide backward dolly 28mm |

Clip 1 is trimmed to ~12s at concat to drop the 3s exit overlap, giving a clean 27s total.

## Required inputs

| Slot | What it is | Example value (from source project) |
|---|---|---|
| `{{action_subject}}` | Who's in the scene (2 characters with contrasting silhouettes) | two skaters (female 18yo athletic + male 19yo lean half-a-head-taller) |
| `{{action_archetype}}` | What's happening (the named action vocabulary) | kickflip duel + bowl-exit + rolling out to street |
| `{{urban_location}}` | Where it's happening (concrete location + materials + time-of-day) | downtown LA skate bowl at golden hour, exit onto cracked asphalt street with palm silhouettes + 90s sedans + brick storefronts |
| `{{character_a}}` | Full SUBJECTS-block description for character A (demo + skin + hair + outfit + equipment + stance) | VEXA NOVA — 18yo female, 170cm, dark-brown skin, white buzz cut, purple tee + charcoal cargo shorts + Vans Old Skool, dark-purple deck, goofy |
| `{{character_b}}` | Full SUBJECTS-block description for character B (with a named pop-culture style reference baked in) | RYU EMBER — 19yo male, 188cm, pale ivory skin, deep crimson hair in Musashi Miyamoto / Vagabond samurai topknot, black tank + charcoal cargo pants + Nike SB Dunks, black-and-red flame deck, regular |
| `{{caption_style_words}}` | Comic-panel SFX text painted into impact frames | KRRRACK / SLAM / POP / GRIND / FWIP |
| `{{scene_continuity_anchor}}` | The exact phrasing that links clip 1's exit to clip 2's opening | "rolling out of bowl exit toward the road, cobalt-and-peach sky, palm silhouettes" → "JUST rolled out of a skate park onto the open street" |
| `{{music_style_keywords}}` | Music bed style (GENRE + BPM + INSTRUMENTATION + PRODUCTION CUES — NO artist names) | skate-punk / hip-hop fusion 110 BPM, distorted palm-mute guitar + boom-bap drums + 808, THPS-soundtrack energy, instrumental NO vocals |
| `{{target_language}}` | Audience language (informs music prompt + any in-frame text) | English-speaking gen-z / streetwear crowd |

## Anti-patterns (lifted from `postmortem/05-workflow-fixes.md`)

- **DO NOT use kling-v3.0-pro for kickflip / ollie / non-default-physics motion**, because kling is tuned for default UGC selfie motion. Seedance-2.0 is the only video model that handles named-trick physics cleanly. (Per user memory `feedback_vg_model_picks`.)
- **DO NOT use i2v with a photoreal-human anchor on seedance**, because the privacy filter blocks it even when the anchor is AI-generated. Pure t2v with detailed text descriptions of stylized characters works fine and is cheaper anyway.
- **DO NOT generate the VS character-card poster before locking the layout reference with the user**, because gpt-5.4-image-2 no-ref produces a generic skatepark scene that loosely interprets "character lineup" — burning $0.20 + 4 min. Always ask for the layout ref BEFORE the first image gen.
- **DO NOT trust CLI help text over the actual code**, because `--audio` says "Veo 3 only" but `media.ts:265` passes the flag unconditionally to any video model. Verify the gate at the provider call site before declining a feature.
- **DO NOT name modern rap artists in `ralphy generate music` prompts**, because ElevenLabs Music ToS rejects them with HTTP 400 `bad_prompt`. Describe via genre + tempo + instrumentation + production cues only.
- **DO NOT skip the AUDIO POLICY block inside the seedance prompt**, because without it seedance invents background music inside the clip and the post-mix doubles up. Ban music explicitly with a 5-line negative block listing "NO MUSIC. NO SOUNDTRACK. NO SCORE. NO MELODIC INSTRUMENTS. NO BEAT."
- **DO NOT use flat amix when both music and diegetic SFX have content**, because SFX feels slotted under music with no breathing room. Use `--duck --duck-threshold 0.04 --duck-ratio 6` so music breathes around each SFX punch.
- **DO NOT try to seedance last_frame → first_frame between two clips for continuity**, because it requires a separate extract step + key-frame re-encode and explicit prompt-text continuity is just as effective for stylized scenes. Hand-engineer the continuity in prompt language instead.
- **DO NOT read a macOS `/var/folders/.../NSIRD_screencaptureui_*/TemporaryItems/` screenshot path 16+ minutes after the user drops it**, because macOS evaporates the floater preview. Copy to `workspace/projects/<id>/refs/` within seconds of receipt, or ask for a re-share.
- **DO NOT generate a marketing poster (VS character-card) if the deliverable is video-only**, because it costs $0.35 + 4 min and is never used as a frame anchor anyway. The seedance prompt holds the character description on its own for animated style.

## Cost ballpark

| Phase | Cost | Note |
|---|---|---|
| Optional VS poster (gemini-3-pro --ref) | $0.15 | Skip unless shipping a marketing card |
| 2× seedance-2.0 clips (15s, 1080p, --audio) | $4.20 | $2.10 per clip |
| ffmpeg trim + concat | $0 | Local |
| ElevenLabs music bed (1-3 variants) | $0 | Flat subscription |
| ffmpeg add-music --duck (per variant) | $0 | Local, ~700ms |
| **Minimum-viable (video-only, 1 music bed)** | **~$4.20** | |
| **Typical (3 music variants, no poster)** | **~$4.20** | Variants are free |
| **Marketing-card variant (with poster + 3 beds)** | **~$4.35** | |

Source project actual: $6.65 (included one unused $2.10 standalone duel clip + $0.35 poster iteration). 1.5× minimum-viable estimate: $6.30. Realistic next-time spend if rules above are followed: $4.20–$4.55.

## What stays literal (the template's DNA)

These descriptors are the template's identity — DO NOT genericize them into slots:

- "Spider-Man Across the Spider-Verse meets Arcane (Netflix)" — the named pop-culture style anchor
- "Large summarized flat color blocks, hard-edge brush strokes, painterly gouache texture, chunky variable-weight ink linework, halftone dot patterns in mid-shadows, chromatic-aberration RGB offset on bright edges, visible canvas grain"
- "Heavy directional shadows in deep saturated tones (cobalt blue, deep magenta, ink-black) instead of grey"
- "NO photorealism, NO 3D render, NO Pixar / Disney CG, NO smooth airbrush, NO commercial CG polish, NO anime cel-shade glossy" — the negative list
- AUDIO POLICY block wording (5-line music ban)
- Seedance camera-grammar vocabulary (low-angle tracking 28mm, side-profile 50mm horizontal sweep, behind-the-shoulder follow 35mm, slow backward dolly 28mm, orbiting close-up 50mm)
- Sidechain-duck values (threshold 0.04, ratio 6, attack 10, release 250 — musically right at ~110 BPM)
- "Comic-panel split + halftone dot bleed + ink-stroke captions" — the structural impact-frame DNA

## See also

- `prompt-cookbook.md` — the verbatim image / video / music prompt patterns with `{{slots}}` substituted in.
- `model-stack.md` — model picks per stage, costs, what worked and what was dropped.
- `hooks.md` — 0–2s comic-panel zoom-in slam + ink-stroke title-word patterns.
- `examples.md` — 2 worked variants (skater duel + parkour chase).
- `README.md` — one-screen "how to use".
