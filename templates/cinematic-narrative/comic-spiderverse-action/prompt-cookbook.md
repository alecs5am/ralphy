# Prompt cookbook — Comic Spider-Verse Action

Verbatim prompt patterns with `{{slots}}` substituted. The aesthetic descriptors (painterly STYLE block, AUDIO POLICY block, negative list) are LITERAL — do not paraphrase between projects.

## Slot map

| Slot | What it is | Source-project example |
|---|---|---|
| `{{action_subject}}` | Who's in the scene (2 contrasting silhouettes) | "two skaters (female 18yo athletic + male 19yo lean+taller)" |
| `{{action_archetype}}` | The action vocabulary | "kickflip duel + bowl-exit + rolling out to street" |
| `{{urban_location}}` | Concrete location + materials + time-of-day | "downtown LA concrete skate bowl at golden hour, exit onto cracked asphalt street" |
| `{{character_a}}` | Full SUBJECTS-block description for character A | "VEXA NOVA — 18yo female, 170cm, dark-brown skin, white buzz cut, oversized washed-purple tee + baggy charcoal cargo shorts + Vans Old Skool, dark-purple deck, goofy stance" |
| `{{character_b}}` | Full SUBJECTS-block description for character B with named pop-culture style reference | "RYU EMBER — 19yo male, 188cm, ivory skin, deep crimson hair in Musashi Miyamoto / Vagabond manga samurai topknot, black tank + charcoal cargo pants + Nike SB Dunks, black-and-red flame-graphic deck, regular stance" |
| `{{caption_style_words}}` | Comic SFX text on impact frames | "KRRRACK / SLAM / POP / GRIND / FWIP" |
| `{{scene_continuity_anchor}}` | Phrasing matched verbatim across clip-1-end ↔ clip-2-open | "rolling out of bowl exit toward the road, cobalt-and-peach sky, palm silhouettes" / "JUST rolled out of a skate park onto the open street" |
| `{{music_style_keywords}}` | Genre + BPM + instrumentation + production cues (NO artist names) | "skate-punk / hip-hop fusion 110 BPM, distorted palm-mute guitar + boom-bap drums + 808" |
| `{{target_language}}` | Audience language | "English-speaking gen-z streetwear crowd" |

## Image generation — OPTIONAL VS character-card poster

Use `google/gemini-3-pro-image-preview` with `--ref` to the user-supplied layout reference. Skip this entire stage if the deliverable is video-only.

```text
KEEP THE EXACT LAYOUT, COMPOSITION, TYPOGRAPHY TREATMENT, BACKGROUND, AND POSTER AESTHETIC OF THE REFERENCE IMAGE. Only swap the two characters, the sport, the names, the title, the stat-block contents, and the equipment in their hands.

LAYOUT (identical to reference):
- 16:9 horizontal character-select / lookbook poster.
- Cool muted blue-grey studio backdrop with a soft vignette and very large faded sans-serif background letterforms behind each figure (the first letter of each character's first name, ghosted at ~15% opacity in the same blue-grey).
- Two full-body characters standing center, one on the left half, one on the right half, framed knees-up to head with ~5% headroom.
- Centered top: small "{{poster_title}}" mini-header in light grey caps with a tiny "VS" badge below it between the two figures.
- Left column (above and beside left character): bold sans-serif name in clean uppercase white. Beneath the name: a small stat block with light-grey label/value rows (STYLE, DECK, STANCE, SIGNATURE).
- Right column mirrored.
- Center-bottom thin horizontal info strip with three small label pairs in faded grey (ARENA, TIME, WEATHER).

CHARACTER A (left side): {{character_a}}.

CHARACTER B (right side): {{character_b}}.

EQUIPMENT / GROUND DETAILS:
At their feet on the studio floor: scattered props specific to {{action_archetype}} — replace any sport-specific kit from the reference (no leftover tennis rackets / basketballs / etc.).

RENDER STYLE — match the reference EXACTLY:
Hyper-detailed semi-realistic 3D character render with fashion-photography lighting; clean studio softbox key from front, soft fill from the side, gentle rim from behind. Sharp focus on both characters, slight depth-of-field falloff into the backdrop. Streetwear lookbook / fighting-game character-select poster vibe. NOT painterly, NOT cel-shaded, NOT Spider-Verse comic, NOT cartoon, NOT illustrated. Realistic skin texture, fabric weave, hair strand detail. Crisp typography, clean grid layout, balanced negative space.

Aspect: 16:9 horizontal poster, 1920×1080.
```

Note the poster register is intentionally **photorealistic 3D-render lookbook** even though the video is **painterly Spider-Verse**. The poster is a marketing surface (fighting-game character-select vibe), the video is the action scene — different registers on purpose.

## Video generation — clip 1 (action setup in {{urban_location}})

Use `bytedance/seedance-2.0` t2v, 15s, 1080p, 16:9, `--audio` ON. ~$2.10.

```text
SUBJECTS:
Character A: {{character_a}}.
Character B: {{character_b}}.

ENVIRONMENT:
{{urban_location}} at peak golden hour, sun raking low from camera-left, deep cobalt sky with peach and lavender cloud streaks, layered background elements at three distances (foreground details, midground silhouettes, hazy warm horizon).

AUDIO POLICY — CRITICAL:
NO MUSIC. NO SOUNDTRACK. NO SCORE. NO MELODIC INSTRUMENTS. NO BEAT. NO BACKING TRACK OF ANY KIND. Audio track must contain ONLY diegetic on-camera sound effects: <6-8 specific SFX cues for {{action_archetype}}>. Strictly silent of music — this video will receive a music track in post.

STYLE:
Digital painting feel, Spider-Man Across the Spider-Verse meets Arcane (Netflix). Large summarized flat color blocks, hard-edge brush strokes, painterly gouache texture, chunky variable-weight ink linework outlining characters, halftone dot patterns in mid-shadows, subtle chromatic-aberration RGB offset on bright edges, visible canvas grain. Heavy directional shadows in deep saturated tones (cobalt blue, deep magenta, ink-black). Highlights as crisp painted shapes. Warm peach/orange highlights, deep cobalt/magenta shadows, accent reds and purples. Comic-panel impact text painted into action frames in chunky ink linework (examples: {{caption_style_words}}). NO photorealism, NO 3D render, NO Pixar / Disney CG, NO smooth airbrush, NO commercial CG polish, NO anime cel-shade glossy.

SHOT 1: Medium tracking, 35mm, low-angle from inside the location.
<Action setup beat — both characters establish themselves in the location, exchange a glance / nod, start moving.>
SFX: <2-3 specific cues>.

SHOT 2: Smooth transition, side tracking, 50mm, horizontal sweep.
<First trade — character A executes a signature beat, character B answers in tandem.>
SFX: <2-3 specific cues>.

SHOT 3: Smooth transition, low-angle hero shot, 24mm, ground-level.
<Escalation — synchronized airborne / impact beat, painted ink-stroke SFX text on impact frame.>
SFX: <2-3 specific cues>.

SHOT 4: Smooth transition, behind-the-shoulder follow shot, 35mm, forward dolly.
<Trick montage — rapid alternating shots with comic-panel impact flashes.>
SFX: <2-3 specific cues>.

SHOT 5: Smooth transition, wide low-angle shot, 28mm, slow backward pull.
<Rolling-out exit — characters leave the location toward the next environment. End on the receding wide shot. {{scene_continuity_anchor}} (clip-1 exit phrasing).>
SFX: <2-3 specific cues, fading>.
```

## Video generation — clip 2 (action continuation in next environment)

Use `bytedance/seedance-2.0` t2v, 15s, 1080p, 16:9, `--audio` ON. ~$2.10.

Same SUBJECTS / AUDIO POLICY / STYLE blocks as clip 1 (copy verbatim — that's the continuity lock). Only ENVIRONMENT and SHOT bodies change.

```text
SUBJECTS:
Character A: {{character_a}}.
Character B: {{character_b}}.

ENVIRONMENT:
<Next environment with matching sky / lighting / silhouette description from clip 1's exit>. They have JUST {{scene_continuity_anchor}} (clip-2 opening phrasing) — match the continuity of the previous clip (same sky, same silhouettes, same painterly look).

AUDIO POLICY — CRITICAL:
<same 5-line ban verbatim as clip 1, with environment-specific SFX cues>

STYLE:
<same painterly STYLE block verbatim as clip 1>

SHOT 1: Wide low-angle tracking shot, 28mm, behind them.
<Continuity arrival beat — characters arrive in the new environment matching clip 1's exit framing.>
SFX: <2-3 specific cues>.

SHOT 2: Smooth transition, side medium shot, 50mm, horizontal tracking.
<Side-by-side action through the new location, small synchronized trade.>
SFX: <2-3 specific cues>.

SHOT 3: Smooth transition, low-angle hero shot, 24mm, ground-level forward.
<Hero shot toward camera with sun flare / silhouette, mid-roll synchronized beat.>
SFX: <2-3 specific cues>.

SHOT 4: Smooth transition, side tracking, 35mm, horizontal sweep.
<Environmental interaction — grind / ollie / vault / launch over a location-specific obstacle.>
SFX: <2-3 specific cues>.

SHOT 5: Smooth transition, wide backward-dolly hero shot, 28mm, slow pull-back.
<Receding wide — characters ride away from camera into the horizon. Hold on the receding silhouettes for the final beat. Optional small victory gesture (fist up, deck flip caught one-handed, etc.).>
SFX: <receding fade>.
```

## Music generation — ElevenLabs music_v1

Generate AFTER the cut is concat'd. Target duration = `cut_duration + 3s tail`. Describe by GENRE + TEMPO + INSTRUMENTATION + PRODUCTION CUES only — NEVER name modern recording artists.

```text
{{music_style_keywords}}-style instrumental for a {{action_subject}} animation in a Spider-Verse / Arcane painterly aesthetic. Tempo <BPM> BPM. <Driving rhythmic motif description>. <Hard-knocking drum pattern description — kick / snare / hi-hat by position>. <Bass description — sub-bass or 808, follow root notes>. <2-3 production cues — turntable scratch / vinyl crackle / synth lead / cymbal hits>. Mid-song <breakdown or build description>. <Adjective stack: raw, energetic, defiant, rebellious — feels like a named cultural genre era>. Cinematic and animated-film grade, NOT polished pop, NOT lo-fi chill, NOT EDM. Instrumental only — strictly NO vocals, NO rap, NO singing, NO lyrics, NO chanting, NO ad-libs. Outro: <fade description into a single tail hit>.
```

**On 400 `bad_prompt`:** parse `error.detail.data.prompt_suggestion` from the response body and pass it back as the next `--prompt` verbatim. The API's suggestion typically passes on resubmit.

### Music prompt that survived ToS in the source project (THPS skate-punk winner)

```text
Skate-punk / hip-hop fusion instrumental for a rebellious teen skater animation, Tony-Hawk-Pro-Skater-soundtrack energy with a Spider-Verse / Arcane painterly aesthetic. Tempo 110 BPM. Driving distorted electric-guitar palm-mute riff in standard tuning, syncopated against a hard boom-bap drum break (snappy kick on the 1, hard cracking snare on the 2 and 4, busy 16th-note hi-hat pattern with occasional open-hat splash), aggressive 808 sub-bass following the guitar root notes, occasional turntable-scratch chirp fill between phrases, brief crashing cymbal hits on bar transitions. Mid-song breakdown: drum-only bar with hand-claps and a quick double-time hi-hat roll, then guitar slams back in. Raw, energetic, defiant, rebellious — feels like Goldfinger / The Distillers crossed with Beastie Boys / Run-DMC / Linkin Park, produced for an animated street movie. Cinematic and animated-film grade, NOT polished pop-punk, NOT mumble-rap, NOT lo-fi chill, NOT EDM. Instrumental only — strictly NO vocals, NO rap, NO singing, NO lyrics, NO chanting, NO ad-libs. Outro: guitar power-chord sustain into a single crashing cymbal hit ringing into silence.
```

Older rock acts (Goldfinger, Distillers, Beastie Boys, Run-DMC, Linkin Park) + named soundtracks (Tony Hawk Pro Skater) currently pass the ToS filter. Modern rap names do not.

## Reusable fragments

### AUDIO POLICY block (drop into every seedance prompt)

```text
AUDIO POLICY — CRITICAL:
NO MUSIC. NO SOUNDTRACK. NO SCORE. NO MELODIC INSTRUMENTS. NO BEAT. NO BACKING TRACK OF ANY KIND. Audio track must contain ONLY diegetic on-camera sound effects: <6-8 SFX cues here>. Strictly silent of music — this video will receive a music track in post.
```

### STYLE block — painterly Spider-Verse / Arcane (literal, do not paraphrase)

```text
STYLE:
Digital painting feel, Spider-Man Across the Spider-Verse meets Arcane (Netflix). Large summarized flat color blocks, hard-edge brush strokes, painterly gouache texture, chunky variable-weight ink linework outlining characters, halftone dot patterns in mid-shadows, subtle chromatic-aberration RGB offset on bright edges, visible canvas grain. Heavy directional shadows in deep saturated tones (cobalt blue, deep magenta, ink-black). Highlights as crisp painted shapes. Warm peach/orange highlights, deep cobalt/magenta shadows, accent reds and purples. Comic-panel impact text painted into action frames in chunky ink linework. NO photorealism, NO 3D render, NO Pixar / Disney CG, NO smooth airbrush, NO commercial CG polish, NO anime cel-shade glossy.
```

### Named pop-culture style reference (per character)

The seedance model recognizes named style references when baked into the character's hair / outfit description: "Musashi Miyamoto from Vagabond by Inoue", "Spike from Cowboy Bebop", "Ezra from Star Wars Rebels", "Edward Elric from Fullmetal Alchemist Brotherhood". Pick a reference that locks the silhouette (hair / cape / signature accessory) and bake it into the SUBJECTS line. Without a named reference the model improvises and silhouette drifts between shots.

### Continuity anchor (clip-1-end ↔ clip-2-open)

End clip 1 with the location-exit phrasing. Open clip 2 with the same phrasing prefixed by "They have JUST". Match the sky color, time-of-day phrasing, and 1-2 silhouette descriptors verbatim across both prompts. This is more reliable AND cheaper than seedance last_frame → first_frame anchoring for stylized work.
