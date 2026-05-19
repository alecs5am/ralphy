# Anthropomorphic Object Drama

> **Postmortem absent — TEMPLATE.md lacks "Key rules" / "Workflow" sections. Run `/postmortem` on the next project using this template** so the durable lessons of *that* project (anti-patterns, model failures, prompt fixes that worked) crystallize into the next revision. The source project (fruit-drama-001) had no `postmortem/`, so this template ships only the structural skeleton + prompt cookbook — no lived-experience rules.

## Vibe

Pixar-3D telenovela parody played dead-straight by anthropomorphic objects. Fruit, vegetables, household appliances — anything you can mount a face on. 7 scenes × 8s = 56s default. Every scene is exactly one beat of a soap-opera arc carried entirely by **on-camera dialogue** (never narrator). Beat-locked-to-dialogue: the dialogue line IS the scene; the keyframe stages it, Veo 3.1 with native audio speaks it, the popping-word caption pops on the strongest word.

The format only works if **face-on-object** stays literal — a single object IS the head, mounted on a humanoid body in simple clothing. Hybrid creatures, photoreal humans, or merely object-themed humans break the spell.

## Beat structure

7 beats × 8s, story-arc-mapped:

| Scene | Duration | Beat | Story role | Characters in frame | Music moment |
|---|---|---|---|---|---|
| scene-01 | 8s | Hook — warm "perfect family" reveal | hook | character_a + character_b | warm intro |
| scene-02 | 8s | Setup — temptation arrives | setup | character_a + character_c | dialogue dry |
| scene-03 | 8s | Rising action — temptation lands | rising action | character_a + character_c | dialogue dry |
| scene-04 | 8s | Discovery — evidence found | discovery | character_a + character_b | dialogue dry |
| scene-05 | 8s | Confrontation — emotional peak | confrontation | character_a + character_b | **MUSIC SWELL** at ~sec 32 |
| scene-06 | 8s | Departure — breakup walk-away | departure | character_a + character_b | dialogue dry |
| scene-07 | 8s | Resolution — rebound / new chapter | resolution | character_b + character_d | warm reset |

Scene-01 is also the **cast-lineup master**: both leads are in frame so the keyframe doubles as the identity anchor for every subsequent scene. Later scenes restate the lock_string of every character in frame because Veo 3.1 has no character-lock primitive.

## Cast (template defaults — replace per project)

The source uses 4 characters; you can run 2–4. Slots:

- `{{character_a}}` — the protagonist (usually the cheater / wrongdoer)
- `{{character_b}}` — the partner / wronged party
- `{{character_c}}` — the seductress / antagonist (optional)
- `{{character_d}}` — the rebound / new chapter (optional)

Each gets a `lock_string` ≥80 words: object identity → eyes/mouth/expression → clothing → posture/vibe. The lock_string is what stays consistent across scenes; Veo will drift otherwise.

## Captions style (popping-word)

Single-word pop-ups, NOT continuous subtitles.

- Font: Inter 900 uppercase (or BoldFont equivalent)
- Fill: `#FFFFFF`, stroke: `#000000` 5px
- Size: ~104px
- Anchor: bottom-center, y ≈ 1380 on a 1920-tall canvas
- Trigger: fires on the emotional-peak word of each dialogue line, NOT every word
- Hold: 700ms, fade: 100ms
- Cyrillic / non-Latin caveat: the scenario already-published one baked Russian word per scene (`СЕМЬЯ`, `ПОМАДА`, `ДЕСЯТЬ ЛЕТ`); for English ship the strongest English word on the same beat
- Cyrillic captions are NEVER asked of Veo (it mangles cyrillic in-clip text) — they are burned on top in the Remotion editor stage

## Music arc (one bed, two structural moments)

A SINGLE continuous music stem with an internal emotional arc — NOT two separate stems.

```
0s   ────────── warm pastel orchestral opening (piano + light pizzicato) ──────────
16s  ────────── quiet timpani builds, growing tension ───────────────────────────
32s  ▲▲▲ DRAMATIC SWELL ▲▲▲  strings + staccato accents — the confrontation beat
48s  ────────── gentle hopeful resolution — warm reset for the outro ────────────
```

Generated via ElevenLabs Music as one continuous bed (~56s). Mixed under VO at ~-22 LUFS feel via ffmpeg sidechain-compress so dialogue stays intelligible.

Every Veo prompt MUST include a "no music, no background score, ambient diegetic only" anti-instruction so the ONLY music is the editor-stage overlay. Two music layers = mud.

## Required inputs (slots)

| Slot | Description | Example from source |
|---|---|---|
| `{{subject_object_class}}` | What family of objects forms the cast | "fruit" |
| `{{character_a_id}}` / `{{character_a_lock_string}}` | Protagonist | "banana-husband" + glossy yellow peel + white office shirt + navy tie lock-string |
| `{{character_b_id}}` / `{{character_b_lock_string}}` | Partner | "strawberry-wife" + red strawberry head + sky-blue dress lock-string |
| `{{character_c_lock_string}}` | Antagonist (optional) | cherry-boss in black blazer |
| `{{character_d_lock_string}}` | Rebound (optional) | carrot-newguy biker |
| `{{character_a_voice}}` / `{{character_b_voice}}` | Voice profile descriptor injected into Veo prompts | "warm motherly female voice mid-30s" |
| `{{target_language}}` | EN default (validated-clean) | "English" |
| `{{plot_trope}}` | The arc | "affair / breakup / found-family rebound" |
| `{{music_arc_descriptor}}` | One-paragraph music brief | "orchestral-pop dramatic-comedy, swell at 32s" |

See `prompt-cookbook.md` for the per-stage prompt scaffolds that consume these slots.

## Anti-patterns (DO NOT)

- **DO NOT** stack ElevenLabs TTS voiceover on top of Veo native audio. Veo speaks the dialogue on-camera with lip-sync; an extra TTS layer desyncs and reads as broken.
- **DO NOT** use TWO separate music stems for intro and climax. One continuous bed with an internal arc. Two stems = audible seam at the cut.
- **DO NOT** let Veo render music inside the clip. Every Veo prompt must ban background music ("no music, no background score, ambient diegetic only"). Two music sources = mud.
- **DO NOT** ask Veo for cyrillic on-screen captions. It mangles them. Burn captions in the editor stage.
- **DO NOT** drop a character lock_string between scenes hoping Veo "remembers" — restate the full lock_string of every character in frame in every video prompt. Veo has no character-lock primitive.
- **DO NOT** mix beat structure with continuous narration. Every 8s = exactly one dialogue beat. If a beat needs two lines, you need two 8s clips, not one squeezed clip.
- **DO NOT** generalize "face-on-object" to "object-themed human" (e.g. a human wearing a banana costume). The object IS the head — that's the format's DNA.
- **DO NOT** treat scene-01 keyframe as just-another-keyframe. It's the cast-lineup master — both leads in frame, full lock-strings, used as a stylistic anchor for every later keyframe.
- **DO NOT** default to Russian VO without confirming with the user. Veo native EN audio is validated-clean; RU drifts on accent + voice-age (per MODELS.md).

## What the source did not capture

This template was extracted from `workspace/projects/fruit-drama-001/` which had no postmortem, no BRIEF.md, and no `prompts.json` (prompts were reconstructed from `logs/generations.jsonl`). The following are NOT codified yet and would be valuable additions in a next-revision template after running `/postmortem` on the next consumer project:

- "Key rules" — the top 5-7 prompt-level rules that worked vs the ones that wasted regen cycles
- "Workflow" — the optimal ordering (e.g. do smoke-test on scene-01 first, only commit to all 7 after the vibe-check)
- Concrete cost-of-failure annotations per anti-pattern
