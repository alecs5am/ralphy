# Prompt cookbook — Anthropomorphic Object Drama

Per-stage prompt scaffolds with `{{slot}}` substitutions. All prompts reconstructed from `workspace/projects/fruit-drama-001/logs/generations.jsonl` — the source project had no `prompts.json`. Mark each with `<!-- reconstructed from gen-log -->` so a future templater pass knows these were not authored as templates.

## Slot map

| Slot | Source example |
|---|---|
| `{{subject_object_class}}` | fruit |
| `{{character_a_lock_string}}` | "a Pixar-3D cartoon banana-headed man, smooth glossy yellow banana peel head with brown ripe spots, friendly round black eyes, small mouth, wearing a slightly rumpled white office shirt with rolled sleeves and a loose navy tie, beige trousers, mid-30s nervous family-man vibe" |
| `{{character_b_lock_string}}` | "a Pixar-3D cartoon strawberry-headed woman, glossy red strawberry head with tiny yellow seeds, two small green leaves on top like hair-bow, big trusting brown eyes with long lashes, soft pink cheeks, wearing a pastel cream apron over a sky-blue summer dress, gentle motherly posture" |
| `{{character_c_lock_string}}` | "a Pixar-3D cartoon woman with one single glossy bright red cherry as her head, long curled green stem on top, sharp confident half-lidded green eyes, deep red glossy lips, wearing a fitted black blazer with a low-cut white blouse, red pencil skirt, gold pendant, predatory warm smile" |
| `{{character_d_lock_string}}` | "a Pixar-3D cartoon orange carrot-headed man, smooth tapered bright orange carrot head with three tall green leaves on top like a fauxhawk, chiseled jawline, blue aviator sunglasses, brown leather biker jacket, white t-shirt, confident relaxed swagger, late-30s bad-boy-with-heart" |
| `{{character_a_voice}}` | gentle reassuring male voice mid-30s |
| `{{character_b_voice}}` | warm motherly female voice mid-30s |
| `{{target_language}}` | English |
| `{{music_arc_descriptor}}` | orchestral-pop dramatic-comedy with warm intro + swell at sec 32 |

---

## Image generation (keyframes)

Model: `google/gemini-3-pro-image-preview`. One keyframe per scene; scene-01 doubles as the cast-lineup master. Every keyframe is the first-frame anchor for the corresponding Veo i2v call.

### Scene-01 keyframe — cast-lineup hook (warm "perfect family")
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, sunny pastel-warm kitchen,
plants on the windowsill, breakfast table with cereal and orange juice in
background. In the foreground at the front door: {{character_a_lock_string}}
kissing {{character_b_lock_string}} on the cheek. Both smile warmly.
Warm morning sun, golden bloom through window. Family photo on the wall
behind them. Anthropomorphic-{{subject_object_class}}-drama Pixar look.
Shallow depth of field, soft cinematic lighting, fully colored, no text,
no captions.
```

### Scene-02 keyframe — temptation arrives
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, sleek modern corner office
with glass walls, city skyline at golden hour through the window, leather
chair, glass desk. {{character_c_lock_string}} sits casually on the edge
of her glass desk, legs crossed, beckoning with one finger. At the doorway
in the foreground, {{character_a_lock_string}} stands frozen, eyes wide,
sweat-drop on his peel. Warm rim light from window, slight red color cast,
deep ambient shadows, dramatic cinematic look. No text, no captions.
```

### Scene-03 keyframe — rising action (tight close-up of temptation)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, tight close-up on two
characters in an office at night with blinds half closed and city lights
outside. {{character_c_lock_string}} leans extremely close and places one
hand on the cheek of {{character_a_lock_string}}, lipstick stain visible
on his cheek. Warm desk-lamp glow, single red practical light off-frame,
deep shadows. No text, no captions.
```

### Scene-04 keyframe — discovery (evidence found)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, home entryway at night,
soft warm hallway lamp, family photo on the wall in the background.
{{character_a_lock_string}} (slightly slumped posture, eyes lowered,
looking guilty) stands just inside the front door. Facing him at the foot
of the hallway, {{character_b_lock_string}} (arms crossed, eyes going
cold and starting to glisten). A small bright red lipstick stain is
clearly visible on his {{character_a_id}} cheek. Warm hallway lamp,
cool blue moonlight from window outside, dramatic lighting. No text,
no captions.
```

### Scene-05 keyframe — confrontation (emotional peak)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, dim living room at night,
single overhead pendant lamp creating a dramatic island of light, the
rest of the room nearly black. {{character_a_lock_string}} on his knees,
juice-tears running, hands clasped pleading. Above him, {{character_b_lock_string}}
(eyes blazing fury + tears, lit smartphone in raised hand) towers, ready
to strike. Low angle on him. Harsh single overhead light, deep dramatic
shadows. No text, no captions.
```

### Scene-06 keyframe — departure (walk-away)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, suburban front yard at
dusk, autumn leaves blowing across the path, picket fence. {{character_b_lock_string}}
(back to camera, determined sad posture) walks away from the house pulling
a small rolling suitcase down the front walk. Running after her from the
house, {{character_a_lock_string}} (peel/skin slightly unzipped from grief,
juice-tears streaming) stumbles forward with arms outstretched. Cold blue
dusk palette, cinematic long-lens framing. No text, no captions.
```

### Scene-07 keyframe — resolution (rebound / new chapter)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation still, vertical 9:16, sunny park at golden hour,
wooden bench beside a calm pond with two ducks, lush green willow trees
in the background. {{character_b_lock_string}} (wiping a single tear,
eyes red from crying) sits on the bench. Beside the bench on a chrome
and black motorbike, {{character_d_lock_string}} extends one hand offering
her a single pink tulip. Warm golden hour sun, lens flare, soft bokeh.
No text, no captions.
```

---

## Video generation (Veo 3.1 i2v with native audio)

Model: `google/veo-3.1`. 8s per clip. `--audio` ON. `--first-frame` = corresponding keyframe. Every prompt restates the full lock-string of every character in frame (Veo has no character-lock primitive). Every prompt includes the language-lock line and the no-music + no-on-screen-text bans.

### Required prompt scaffold (every Veo prompt)

```
Pixar-style 3D animation, {{setting + lighting from scenario beat}}.
{{character lock-strings of EVERY character in frame, full text, every time}}.
{{action description — who does what physically}}.
{{speaker}} speaks ON CAMERA, lips moving naturally, {{character_X_voice}}
in {{target_language}}: "{{exact dialogue line}}".
{{any reaction from the other character}}.
{{lighting register}}.
Only {{speaker}} speaks on camera. No narrator, no voiceover, no on-screen
text, no captions, no subtitles. No music, no background score, ambient
diegetic only.
```

### Scene-01 — hook (TWO speakers, two-shot dialogue)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation, two cartoon {{subject_object_class}}-headed
characters at a sunny kitchen doorway. {{character_b_lock_string}} faces
{{character_a_lock_string}}. She speaks first ON CAMERA, mouth moving
naturally, {{character_b_voice}} in {{target_language}}: "{{line_b_01}}".
She kisses him on the cheek. He responds ON CAMERA, mouth moving,
{{character_a_voice}} in {{target_language}}: "{{line_a_01}}". Both smile,
she waves. Warm morning sun through window, slight handheld camera breath.
Only the two characters speak on camera with visible lip movement. No
narrator, no voiceover, no on-screen text, no captions, no subtitles.
No music, no background score, ambient diegetic only.
```

### Scene-03 — rising action (single speaker, close-up)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation, tight close-up, dim office at night with city
lights through half-closed blinds. {{character_c_lock_string}} leans
extremely close and places one hand on the cheek of {{character_a_lock_string}}
(eyes now wide and frozen, slight sweat-drop on forehead, small lipstick
stain on his cheek). She speaks ON CAMERA, lips moving slowly and
seductively, {{character_c_voice}} in {{target_language}}: "{{line_c_03}}".
{{character_a}} stays frozen, only swallowing nervously, eyes darting.
Warm desk-lamp glow, single red practical light off-frame, deep shadows.
Only {{character_c}} speaks on camera. No narrator, no voiceover, no
on-screen text, no captions. No music, no background score, ambient
diegetic only.
```

### Scene-05 — confrontation (the music-swell beat)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation, dim living room at night, single overhead
pendant lamp creating an island of light surrounded by near-black shadow.
{{character_b_lock_string}} (eyes blazing with fury and tears) thrusts
a glowing smartphone at a kneeling {{character_a_lock_string}} (juice-tears
running down cheeks, hands clasped in pleading prayer). She shouts ON
CAMERA, voice cracking with anger and heartbreak, {{character_b_voice}}
in {{target_language}}, lips moving with full emotional commitment:
"{{line_b_05}}". {{character_a}} flinches with every word, more juice-tears
falling. Low angle on him; she towers above. Harsh single overhead light,
deep dramatic shadows. Only {{character_b}} speaks on camera. No narrator,
no voiceover, no on-screen text, no captions. No music, no background
score, ambient diegetic only.
```

### Scene-07 — resolution (the warm reset)
<!-- reconstructed from gen-log -->

```
Pixar-style 3D animation, sunny park at golden hour, wooden bench beside
a calm pond with two ducks, willow trees in soft bokeh background.
{{character_b_lock_string}} (wiping a single tear, eyes red from crying)
sits on the bench. Beside the bench on a chrome and black motorbike,
{{character_d_lock_string}} extends one hand offering her a single pink
tulip. He smiles confidently and speaks ON CAMERA, {{character_d_voice}}
in {{target_language}}, slight playful charm, lips moving naturally:
"{{line_d_07}}". She looks up surprised, soft blush rising, the corners
of her mouth lifting into a small smile. Slow dolly-in. Warm golden hour
sun, lens flare, soft bokeh. Only {{character_d}} speaks on camera. No
narrator, no voiceover, no on-screen text, no captions. No music, no
background score, ambient diegetic only.
```

Scenes 02, 04, 06 follow the same scaffold — see `scene-02-keyframe` etc. above for the visual block; wrap with the language-lock + no-music ban.

---

## Music generation (ElevenLabs Music — ONE bed, two-section arc)
<!-- reconstructed from gen-log -->

Model: `elevenlabs/music`. ONE call. ONE bed. Internal emotional arc.

```
{{target_audience_or_format}} {{subject_object_class}}-drama TikTok
soundtrack. Instrumental cinematic {{music_arc_descriptor}}. Soft piano
+ light pizzicato strings opening, growing tension with quiet timpani
builds around 16s, dramatic swelling strings + sharp staccato accents on
the betrayal beat at 32s, then warm gentle hopeful piano resolution at
48s for the happy ending. Pixar emotional storytelling vibe. Med energy,
mixed for under voice-over (-22 LUFS feel), single continuous bed with
natural emotional arc — no abrupt drops or vocals.
```

Critical: this is **one continuous file**, mixed by ffmpeg sidechain-compress under the concat'd Veo clip audio. NOT two separate stems.

ElevenLabs Music ToS bans named-artist / named-producer references — keep prompts genre + tempo + instrumentation only.

---

## Captions generation (popping-word)

Model: `elevenlabs/scribe_v1` on the FINAL mixed audio (concat of all 7 Veo clips with music mixed under). Word-level timestamps.

Render: pop ONE word at a time at the emotional peak. Not every word, only the strongest in each line. Inter 900 uppercase, white `#FFFFFF` fill, 5px black `#000000` stroke, ~104px, anchored bottom-center y ≈ 1380, 700ms hold + 100ms fade. Spring scale-in.

No LLM prompt needed for caption generation itself — the heuristic is: per dialogue line, manually choose the strongest emotional word in your scenario's `dialogue[].text`, and only pop that one. The source baked these in `scenario.json:scenes[].baked_caption` per scene (`СЕМЬЯ`, `ОСТАНЬСЯ`, `СЛАДКИЙ`, `ПОМАДА`, `ДЕСЯТЬ ЛЕТ`, `ПРОСТИ`, `МОРКОВКА`).

If language is non-Latin (cyrillic, etc.), set captions in the editor stage only — never ask Veo to render them in-clip.
