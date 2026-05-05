# Soviet Nostalgic TikTok Ad — Template

A vibe reference for a specific format of TikTok-native product ad: **an off-screen young narrator tells a two-era heritage story in deadpan Russian. Someone invented something in the Soviet era. It was shelved. A modern successor revived it.** The era flips halfway through, and so does the music — from a nostalgic Soviet bed to a contemporary hip-hop beat, on the exact frame the heir appears.

This template is a **reference, not a script generator.** The scenario for any new project should be written fresh by `/ralph-ugc:create-scenario` (or by hand) using this document as a tone/vibe/visual-language guide. Don't mechanically fill in blanks — absorb what makes the format work and make decisions appropriate to the new product.

Concrete reference implementation: [`workspace/projects/solutions-metal-001/`](../../projects/solutions-metal-001/) — the COTTON METAL cap video. Read [reference-example.md](reference-example.md) for the full VO, the per-clip motion sketch, and annotations on what to notice.

## Why the format works

- **Two-era structure** gives a complete narrative arc — setup, loss, revival — inside 60 seconds. Viewers stay through because they want the reveal: "what was made in the 70s, and what is it now?"
- **Archival aesthetic (Svema 35mm grain + warm amber palette, full-bleed frame)** reads as authentic documentary without saying so. Then the cut to cold modern editorial in the second half carries the story beat — the era flip is visible before it's explained. Do **not** add a decorative "СВЕМА 35 / ФОТОГРАФИЯ" matte border around the image — the grain/palette do the work, the border looks kitschy on video.
- **Deadpan young narrator** (off-screen, never a talking head) makes it feel like someone telling a family story to a friend, not an ad. Russian-speaking audiences lock onto the intonation instantly.
- **DJ-drop at the era flip** is the kinetic payoff. Nostalgic bed ducks, modern beat lands as the heir appears. Scroll-stopping even for viewers scrubbing past.
- **The Soviet bed track is part of the trend.** TikTok audiences recognize it immediately — it's not a generic "Soviet-sounding" background, it's *the* audio signature of this format. Swapping it out breaks recognition. **Use the canonical track at `assets/trend-soviet-bed.mp3`** (see "Music" section below), don't generate a substitute via Lyria2.
- **Concrete objects carry the story.** A notebook, a sample, a drawer, a product. Each is shown and referenced. No stock-feeling B-roll.

## Vibe anchors — keep these constant

These are what make the format the format. If you change them, you're making a different video.

- **Narrator:** off-screen, male, ~25 years old, deadpan, measured, unhurried. No broadcaster energy. No selling vocabulary ("revolutionary", "unique", "best"). He sounds like a calm young craftsman telling his grandfather's story to you.
- **Language:** native Russian only. No translation, no English overlay. Tested: Seedance/Veo/Kling native TTS all fail on Russian — use ElevenLabs `eleven_multilingual_v2` with a user-owned voice clone.
- **Two eras, hard visual contrast:**
  - Era 1 (Soviet, ~1960s–1980s): warm amber palette, Svema 35mm grain, tungsten desk lamps, institutional settings (research institute, ministry, lab). Full-bleed 9:16 — no archival matte/border around the image.
  - Era 2 (modern): cold neutral editorial studio, polished concrete, matte black, sharp focus, no grain. Full-bleed.
- **Objects over people.** Hands on a notebook, a sample on a table, a drawer closing, a product being held. Faces exist but aren't the subject. No talking heads.
- **Tagline on the last clip** that echoes the video's own structural shape ("Одна идея. Две эпохи. …"). The product/brand name is the last word.

## What varies project-to-project

Decide per project:
- The **product** and its plausible Soviet-era precursor (material, mechanism, device)
- The **inventor** character (grandfather, father, aunt, uncle — someone the modern narrator has a real relation to)
- The **modern heir** — usually the real brand founder or designer, preserved as identity anchor via 3 reference photos
- The **institute / setting** — НИИ, factory, design bureau, regional lab. Name it specifically when you can.
- The **year of invention** (specific: "В семьдесят четвёртом" is stronger than "in the 70s")
- The **rejection reason** — profile mismatch, material reallocation, ministry politics, budget cut. Concrete, not abstract.
- The **scene count and durations** — typical 6–10 clips, total ~60s. Match each clip duration to `Math.ceil(its_VO_length)`.
- The **tagline structure** — it should mirror the video's arc in 3–5 words ending on the brand/product.

## Required inputs from user before you start

Before kicking off generation, make sure you have (and log via `ralph project log-asset`):
1. **Product reference photos** — real product shots, any angle. At least 1, ideally 3–4.
2. **Modern heir character photos** — 3+ reference photos of the real person (the brand founder/designer). Different angles and expressions. These go into `nano-banana-pro/edit` as identity anchors.
3. **Brand brief** — 1–3 sentences on the product and why it exists. The brand's own words, not marketing copy.
4. **ElevenLabs voice_id** — a Russian-speaking male voice clone. Either user-owned or a default library voice that matches (deadpan young adult — theatrical/mature voices break the vibe).
5. **Hip-hop bed for the second half:** either Lyria2-generated (prompt in `fragments.md`) or user-provided. The Soviet bed itself is fixed — use the canonical trend track at `assets/trend-soviet-bed.mp3`.

Scribble the brief and each ref into logs immediately:
```bash
ralph project log-prompt <id> --text "<full brief>" --stage brief
ralph project log-asset <id> --kind photo --source <path> --purpose character-ref
ralph project log-asset <id> --kind photo --source <path> --purpose product-ref
```

## Narrative arc (as a shape, not a prescription)

Write the scenario to cover this shape — in however many clips feels right, with whatever line structure the story needs. Let the `/ralph-ugc:create-scenario` skill handle specifics once you've decided what era-1 invention, era-2 revival, and modern product you're telling.

1. **Era 1 opens on the inventor at work.** Identifies the character, the year, the setting. ~15s of Soviet documentary footage.
2. **Mechanism beat.** How the invention works, in the inventor's terms. This is the most technical moment.
3. **Hidden struggle beat** (optional but strong). Failed attempts, the one that worked. "Первые два ушли в брак. Третий — получилось."
4. **Rejection beat.** The invention is shelved. Ministry, commission, budget, priorities. End on finality: "Закрыли.", "Отказали.", "В архив."
5. **Transition beat.** The artifact — notebook, blueprint, sample — goes into a drawer / gets stored / is forgotten. End of era 1.
6. **[MUSIC DROP + era flip]** Modern heir rediscovers the artifact. Short beat, low-key. The heir is real, named, the brand's actual founder.
7. **Product beat.** What they built from the old idea. Hands-on demonstration if possible.
8. **Tagline + brand.** Mirror the video's shape in 3–5 words. End on the product/brand name.

The reference video does this in 8 clips (9+11+7+10+5+7+8+8 sec). Other shapes work — 6-clip videos land, 10-clip videos land. Trust the VO length.

## Music

### Soviet bed — REQUIRED, don't generate

The Soviet-era half of every video in this format uses **the same canonical trend track** shipped with this template:

- Path: `workspace/templates/soviet-nostalgic/assets/trend-soviet-bed.mp3`
- Duration: 60.0 seconds
- Source: a TikTok trend audio used widely in this video format; audience recognition is half of why the format works

**Don't substitute this with a Lyria2 generation.** The specific track is part of the trend — viewers recognize it within 1–2 seconds and that recognition is load-bearing. A "similar vibe" generated track loses that.

At project scaffold time, copy the track into the project:

```bash
# After `ralph template use soviet-nostalgic --project <new-id> ...`
cp workspace/templates/soviet-nostalgic/assets/trend-soviet-bed.mp3 \
   workspace/projects/<new-id>/assets/music/soviet-bed.mp3
```

If the video is longer than 60s of Soviet-era content (rare — it's usually ~40s), crossfade-loop it with ffmpeg:

```bash
ffmpeg -y -i soviet-bed.mp3 -i soviet-bed.mp3 \
  -filter_complex "[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[a]" \
  -map "[a]" -b:a 192k soviet-bed-looped.mp3
```

### Hip-hop bed — generate or provide

The modern-era half kicks in at the DJ-drop. Use either:
- **Lyria2 generation** with the `HIPHOP_BED_PROMPT` in [fragments.md](fragments.md) (~$0.10, ~30s output), or
- **A user-provided track** if they have something specific in mind

Either works. The hip-hop track is less trend-bound than the Soviet bed — any confident 80 BPM dark trap instrumental lands.

## Workflow

1. **Scaffold:**
   ```bash
   ralph template use soviet-nostalgic --project <new-id> --name "..." --brief "..."
   ```
   Creates empty project dirs + `TEMPLATE_ORIGIN.md` + `BRIEF.md`. **Does not write scenario.json** — that's the skill's job.

2. **Log user inputs:** brief and every reference photo/url the user provides (`ralph project log-prompt`, `log-asset`).

3. **Research & write scenario:** use `/ralph-ugc:create-scenario` with the template (read `TEMPLATE.md` + `reference-example.md`) and the user's product info. Output: `scenario.json` that the user locks.

4. **Generate character refs** — if the inventor is fictional, generate a portrait via `nano-banana-pro` text2img as identity anchor. Upload user-provided heir photos to fal CDN.

5. **Generate keyframes** — 1 per clip, `nano-banana-pro/edit` with character + product refs. Use fragment library in [fragments.md](fragments.md). Log every call via `loggedFetch` or `logGeneration`.

6. **Generate videos** — Kling v3 Pro i2v, `generate_audio: false`, 1 per clip, motion prompt per clip. See [model-stack.md](model-stack.md) for why.

7. **Generate voiceover** — ElevenLabs per-scene mp3s. Settings in [fragments.md](fragments.md).

8. **Prepare music** — copy the canonical Soviet bed from `workspace/templates/soviet-nostalgic/assets/trend-soviet-bed.mp3` into the project's `assets/music/`. Generate or provide the hip-hop bed.

9. **Compose** — Remotion composition following the pattern in [composition.md](composition.md). Register in `src/Root.tsx`, render.

10. **After success, update template** if you discovered something reusable — add a fragment, document a failure mode, adjust guidance.

## Cost ballpark (per video)

~$10–14 in API calls, based on `solutions-metal-001` actuals. Dominant cost is Kling v3 Pro ($0.14/sec × 8 clips × ~8s avg). Full breakdown in [model-stack.md](model-stack.md).

## When NOT to use this template

- Fast-paced FMCG ad — the deadpan pacing will feel slow.
- Products with no plausible retrofuturistic framing. If you can't invent a believable Soviet precursor, the arc falls apart.
- Audiences outside Russian-speaking CIS — subtitles can work but the intonation carries half the emotion.
- Products that want to feel "new". The whole vibe is "this has been here longer than you think".

## Files in this template

- `TEMPLATE.md` (this file) — high-level guide, vibe, workflow
- [reference-example.md](reference-example.md) — concrete example from `solutions-metal-001` with annotations
- [fragments.md](fragments.md) — reusable prompt-fragment library (style, character descriptions, product descriptions, quality guards, music prompts, VO settings)
- [model-stack.md](model-stack.md) — what to use, what to avoid, why, with documented failure modes
- [composition.md](composition.md) — Remotion TSX skeleton with TransitionSeries fade + dual-music split + VO sync pattern
- `template.json` — machine-readable metadata
