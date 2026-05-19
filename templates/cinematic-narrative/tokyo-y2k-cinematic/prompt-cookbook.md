# Prompt cookbook — Tokyo Y2K Cinematic Near-Miss

Per-stage prompts crystallized from `workspace/projects/tokyo-y2k-001/`. Slots in `{{double_curlies}}` are project-specific; everything else is the template's DNA — keep literal.

## Stage 1 — Image anchors (one per shot, 15-17 total)

Model: `google/gemini-3-pro-image-preview` (default, holds 35mm film register cleanest) OR `openai/gpt-5.4-image-2` (fallback for 16:9 architectural / signage-heavy frames). Cost ~$0.15-0.20 per anchor. Always pass `her-master.png` + `him-master.png` inline as refs on every per-scene anchor where the cast appears, for identity-lock across all 15-17 shots.

### Template skeleton (all shots inherit this DNA paragraph verbatim)

```
Photoreal 35mm film still, 16:9 cinematic frame, {{aesthetic_era}}. Shot on Sony A7 IV with Sigma {{lens_mm}}mm f/1.4 Art lens at f/{{aperture}}, Kodak Portra 400 emulation, mild halation on highlights, subtle 35mm grain, lifted blacks (not crushed). Cinematic 16:9, NOT vertical.

SUBJECT: {{per-shot subject paragraph — see per-shot variants below}}

FRAMING: {{per-shot framing — locked-off tripod, frame-within-a-frame where possible}}. {{Foreground occlusion if any: condensation glass, rain streaks, train-window reflection, sliding-door edge, vinyl bin foreground}}.

LIGHT: single ambient source — {{warm-tungsten kissaten ceiling | overcast window-light | cool tube-fluorescent overhead | neon-fill from camera-right | top-down konbini-light}}. NO on-camera flash. NO hard shadows on face. Highlight roll-off gentle.

PHOTOREAL CRAFT (mandatory): visible natural skin texture and pores on cheek and nose, faint flyaway hairs catching the rim light, very slight facial asymmetry, micro-expression of held breath, NO beauty filter, NO glossy plastic skin, NO enlarged anime eyes, NO reshaped jawline. Hands rendered correctly — five fingers each, correct knuckle anatomy. {{Per-shot prop: Olympus mju-II rendered correctly — small, smooth black plastic, sliding lens cover, tiny viewfinder, NOT a DSLR | etc.}}.

GRADE: {{per-shot grade — dawn cool-slate + cream | kissaten warm-tungsten + cyan exterior | platform desaturated-gray + green Yamanote stripe | vending alley cool-white + magenta cumulonimbus | Shibuya pink-purple sky + tungsten signage | rain monochrome cool-blue | trains-passing deep blacks + soft pink/cyan isolates}}. Lifted blacks toward dark green/blue. Skin tones natural warm. Film grain visible but not noisy.

NEGATIVES: no VHS lines, no date stamp, no chromatic aberration, no scanlines, no CRT, no anime, no airbrushed skin, no glossy lips, no beauty cam, no DSLR (only the Olympus mju-II), no smartphone, no Latin signage, no readable text, no logos, no captions, no on-screen text, no vertical/portrait orientation, no oversaturated colors, no HDR look.

Aspect: 16:9 widescreen cinematic. Output 1920x1080 or 1536x864 register.
```

### Per-shot subject paragraphs (worked examples from source project)

**Establishing wide — dawn platform (shot 1, 6s)**

```
SUBJECT: empty {{city_name}} {{rail_system_signature}} platform at dawn, single sparrow on the yellow tactile line, faint cumulonimbus stacking behind a power-line silhouette.
FRAMING: static wide, symmetrical, deep DoF. 35mm lens-feel.
LIGHT: cool slate dawn ambient, lifted blacks, soft halation on platform fluorescents still on.
BEAT: establishing — the city is asleep, about to wake.
```

**Through-glass introduction — kissaten window (shot 2, 5s)**

```
SUBJECT: {{character_a}} sitting at a kissaten (old-school Tokyo coffee shop) window booth seat. She is holding a small black Olympus mju-II film camera in both hands, just beginning to raise it toward her right eye. Mouth slightly open in quiet concentration.
FRAMING: medium close-up FROM OUTSIDE the kissaten window — she is photographed THROUGH the glass. Lower third fogged with condensation. Faint cyan dawn light reflects on the glass. Warm tungsten kissaten interior glow wraps around her face. Foreground blur of condensation droplets.
LENS: 50mm at f/2.0, shallow DoF, face razor sharp, background bokeh of tungsten bulbs.
LIGHT: kissaten tungsten ceiling bulbs soft warm key from camera-right. Cyan dawn sky through window acting as cool rim on her left side.
GRADE: warm tungsten interior amber + cyan exterior dawn = classic teal/orange split done subtly.
```

**JP signage typography slam — vending-machine alley walk (shot 8, 6s)**

```
SUBJECT: {{character_a}} walks down a tiny vending-machine alley, top-down hard fluorescent illuminating just her shoulders and the film camera at her hip. She stops mid-frame, reloads a roll of Portra 400 — hands close to camera, the film leader catching the light as she pulls it across the spool.
FRAMING: static wide-becomes-medium via her standing position. Vertical slot of magenta cumulonimbus sky visible at the top of the frame between the two opposing vending-machine walls. {{japanese_signage_type}} fluorescent ad-faces glow from both walls.
LENS: 35mm, deep DoF.
LIGHT: cool whites top-down from vending machines acting as hard key, magenta cumulonimbus through the alley slot of sky acting as fill.
GRADE: electric-cool-white + magenta cast, lifted blacks toward navy.
```

**Rain-on-glass macro — emotional peak (shot 11, 9s)**

```
SUBJECT: through a wet record-shop window from the outside — {{character_a}}'s reflection layered over {{character_b}}'s silhouette inside the shop. He's flipping vinyl. She's pausing in the rain to look at her own reflection — she does not realize he is behind it.
FRAMING: static medium. Heavy rain on the glass acts as primary foreground texture. Focus locked on the glass surface — her reflection razor sharp on top layer, his silhouette soft on the back layer. {{japanese_signage_type}} unreadable kanji of the shop name catches faint tungsten interior glow at the top of the frame.
LENS: 50mm at f/2.8, focus on glass surface.
LIGHT: cool exterior rain palette, warm tungsten shop interior glow behind. Deep blacks. Single backlight halation on her hair.
BEAT: the film's cleanest "almost-meeting." Neither knows. THE EMOTIONAL PEAK — held ~9s.
```

**Trains-passing — the only-yes moment (shot 12, 4s)**

```
SUBJECT: {{character_a}} is on a train going one direction. {{character_b}} is on a train going the other. Trains pass on parallel tracks. ONE SINGLE STILL FRAME (held ~12 frames at 24fps so it reads) where their reflections in the window glass *align* in the gap between cars — like a double-exposure photograph. Then gone.
FRAMING: static medium, side-on to the train. Two opposing train interiors layered through the gap.
LENS: 50mm.
LIGHT: deep blacks dominant. Isolated soft pink from one train interior, isolated soft cyan from the other. A single white halation flares in the gap between cars at the alignment moment.
BEAT: the film's ONLY "yes" — lasts a half-second.
```

## Stage 2 — Video i2v (one per anchor, 15-17 clips)

Model: `kwaivgi/kling-v3.0-pro` for ALL human-anchored shots. `bytedance/seedance-2.0` reserved for landscape / hands-only / empty-courtyard / object-only shots. Cost ~$0.63-0.70 per Kling clip × 17 = ~$10-12 per pass.

**Invariants on every i2v prompt:**

- `--audio OFF` always (zero diegetic — music is a separate ElevenLabs Music post-mix).
- Both `--start-frame` and `--end-frame` provided when possible (per `feedback_start_end_frame_motion_delta`). The two frames must show a distinct physical micro-beat.
- Request `--duration` ONE SECOND SHORTER than the storyboard's planned beat (the model overshoots by ~1s, so 4s requested → 5.04s on disk → fits 4s slot after trim).
- "Locked-off camera on tripod, zero camera movement, zero pan, zero zoom" prepended to every prompt.

### Template skeleton

```
Locked-off camera on tripod, zero camera movement, zero pan, zero zoom. Static cinematic frame, {{aspect}}.

{{Subject action over the clip duration — describe the physical micro-beat — gesture, head turn, shutter press, vinyl flip, hand-to-forehead, walking into frame, train pulling away. ONE clear physical change between start frame and end frame.}}

{{Environmental detail — what moves passively in the scene: light shifts on glass, condensation drip, rain on plastic umbrella, neon flicker, vending machine fluorescent buzz (visual only — no audio), passing reflection, ambient steam, distant figure passing.}}

NO music, NO dialogue, NO voice, NO ambient soundtrack, NO traffic, NO train clatter, NO rain audio, NO shutter sound, NO diegetic audio of any kind. (Audio is added separately in post.)

{{Per-shot grade — same grade as the anchor: warm tungsten + cyan / cool-slate dawn / desaturated grays + Yamanote green / etc.}}

Aspect: {{16:9 widescreen cinematic | 9:16 letterboxed if generated direct-to-9:16}}.
```

### Per-shot action verbs (one micro-beat each)

| # | Shot | Micro-beat action |
|---|---|---|
| 0 | pastoral opener | wind crosses the field, her cardigan ripples, she does not turn |
| 1 | dawn platform | sparrow takes off mid-shot, single fluorescent ad-sign flicker |
| 2 | kissaten window | she raises Olympus mju-II from lap level to her right eye in a smooth slow arc, then pauses, then presses shutter (faint mechanical click — visual only) |
| 3 | sliding door | he pushes the sliding glass door open frame-left as she stands and exits frame-right; door swing obscures both their faces for half a beat |
| 4 | vinyl hands | his hands flip 7" vinyl in the bin; one record slides out, he hesitates, slides it back |
| 5 | platform face-to-face | train pulls away across the tracks; both their phones / camera held; neither looks up |
| 6 | Yamanote interior | she raises the mju-II, presses the shutter; the empty seat across her stays empty |
| 7 | train window forehead | his forehead presses against the train window; passing neon reflection sweeps across his face |
| 8 | vending alley | she walks into frame, stops, reloads a roll of Portra 400 — film leader catches the light |
| 8p | sakura courtyard | sakura petals drift in slow diagonal, NO people, single curtain billows in a far-distant window |
| 9 | Shibuya crossing | hundreds of silhouettes cross between them; she looks up, he looks down at his phone — they never lock eyes |
| 10a | umbrella sequence | vinyl umbrellas pop open one by one across the frame in a left-to-right cascade |
| 10b | kissaten awning | he ducks under the awning, hand to forehead, lets out a tiny self-amused smile, then drops the hand |
| 11 | rain-on-glass record shop | her reflection on the glass holds still; he turns his head once inside the shop (he can't see her); she remains looking at her own reflection |
| 12 | trains passing | the two trains close, reflections align for ~12 frames at 24fps, then the trains pull apart |
| 13 | half-smile close | almost-imperceptible half-smile crosses her face — single micro-expression, no full smile |
| 14 | empty platform fade | single fluorescent ad-sign cycles once; fade to black mid-music-phrase (handled in Remotion, not here) |

## Stage 3 — Trim analysis (one call per clip, 15-17 calls)

Model: `google/gemini-3.1-pro-preview` via `ralphy ref analyze-video <local-path>`. Latency ~9-15s per clip. Parallelizes at `xargs -P 6` with no rate limits. Cost ~$0.05-0.20 per clip.

Write `logs/trim-prompt.md` once, then run the batch.

### Verbatim prompt (validated worked block)

```
You are watching ONE {{shot_dur_min}}–{{shot_dur_max}}-second video clip from a {{clip_count}}-shot cinematic short called *{{piece_title}}*.

The piece is a {{aesthetic_era}} "{{arc_descriptor}}" arc, locked-off tripod, 35mm grain register, soft natural light, ~5s average shot length, zero diegetic audio (music carries every beat). Sibling-piece to KYO KIMURA's `honeybee`.

The clip you are watching is one of the {{clip_count}} shots. The full piece needs to be cut down from its current ~{{raw_total_sec}}s total to **exactly {{music_duration_sec}}s** to match the music bed. We need to shave roughly {{avg_trim_sec}}s of dead time from each clip on average.

## Your job

Watch the clip and return STRICT JSON with the following schema. No prose, no markdown fences. Just JSON.

{
  "observed_duration_sec": <float>,
  "scene_summary": "<one sentence>",
  "beats": [{"t_start": <float>, "t_end": <float>, "what": "<beat>", "value": "low|medium|high"}],
  "dead_head_sec": <float>,
  "dead_tail_sec": <float>,
  "best_subwindow": {"t_start": <float>, "t_end": <float>, "duration_sec": <float>, "rationale": "<why>"},
  "trim_recommendation": {"max_trim_sec": <float>, "trim_from": "head|tail|both|none", "notes": "<caveat>"}
}

## Calibration
- A `high` beat is something the storyboard explicitly calls out (a gesture, a near-miss, a reflection alignment). Identify these generously.
- A `low` beat is filler — static breath time, unchanging frame.
- `best_subwindow` should be 4–6 seconds long for most clips (3s OK for short beats, 9s OK for the emotional-peak shot).
- If every frame is load-bearing — say so honestly with `max_trim_sec: 0`.
- Err on **preserving** the storyboard beat over aggressive trimming.

Return ONLY the JSON object. No preamble.
```

**Key tokens that made the difference:**

- The *piece-level context paragraph* (style anchor, locked-off, zero diegetic) → gemini correctly identifies "static breath time" as low-value vs. "the shutter press" as high-value.
- The *strict-JSON-no-prose-no-fences* instruction → output is `jq`-able immediately, no parsing hacks.
- The *calibration list* with explicit "preserving > aggressive" → no over-trimming.
- The *clip-count + total-sec gap statement* → gemini understands the budget pressure and doesn't recommend `none` on every clip.

### Batch driver (xargs)

```bash
mkdir -p logs/trim-analysis
ls assets/videos/*.mp4 | \
  xargs -I{} -P 6 sh -c '
    name=$(basename "{}" .mp4)
    bun run ralph -- ref analyze-video "{}" \
      --prompt-file logs/trim-prompt.md \
      --out "logs/trim-analysis/${name}.json" \
      --max-tokens 4096
  '

# Tabulate
jq -r '. | "\(.scene_summary | .[0:60])\t\(.best_subwindow.t_start)\t\(.best_subwindow.t_end)\t\(.trim_recommendation.max_trim_sec)\t\(.trim_recommendation.trim_from)"' logs/trim-analysis/*.json
```

## Stage 4 — Music (1 final bed + 3 variants)

Model: `eleven_music_v1` via `ralphy generate music`. Cost: $0 (free tier as of source-project session). Concurrency cap: **2 in-flight per subscription** — batch in groups of 2 or serialize.

### Verbatim prompt — main bed (validated WINNER)

```
{{music_brief}}
```

Default expansion (source project's WINNER):

```
Modern-classical cinematic instrumental piece in the register of late-1990s Japanese art-cinema scores. Adagio tempo, approximately 60 BPM. {{duration_sec}} seconds. Intimate solo piano lead — felt-hammers, close-mic'd, very gentle and unhurried — entering immediately at 0:00 with a wistful melodic phrase in a minor key. Soft swelling strings enter quietly around the 0:30 mark. Single solo cello phrase peaks at the emotional center (around 0:55-1:05). Strings recede by the 1:10 mark, leaving solo piano alone for the final phrase. The final phrase fades unresolved — no musical resolution, no full cadence, mid-phrase fade. No vocals. No percussion. No synths. No sound effects. No diegetic audio. No dialogue. Mood: wistful, tender, slightly heartbreaking. Not sad, not hopeful. Almost.
```

### Variant prompts (for A/B/C/D testing against the locked timeline)

**Variant A — piano-forward, no cello:**

```
Modern-classical cinematic instrumental piano solo, intimate close-mic'd felt-hammer upright piano, adagio 60 BPM, single melody line with sparse left-hand chords, no strings, no synths, no percussion, wistful tender unresolved mood, slow contemplative phrases with silence between notes, {{duration_sec}} seconds, final phrase fades unresolved, no vocals, no sound effects, no diegetic audio, no dialogue
```

**Variant B — koto + piano (JP accent):**

```
Modern-classical Japanese-influenced cinematic instrumental, sparse koto plucks layered with intimate felt-hammer piano, adagio 55 BPM, soft warm strings entering at the 30 second mark, single mournful melody, gentle reverberation, wistful melancholic tender mood, contemplative slow phrases, {{duration_sec}} seconds, final phrase fades unresolved, no vocals, no percussion, no synths, no sound effects, no diegetic audio, no dialogue
```

**Variant C — ambient pad + sparse piano:**

```
Ambient cinematic instrumental, warm sustained synth pad drone in low register, sparse intimate felt-hammer piano playing single notes above the pad, adagio 55 BPM, slow drifting wistful melancholic mood, no strings, no percussion, no melody arc, contemplative atmospheric texture for a quiet {{city_name}} film, {{duration_sec}} seconds, final note fades unresolved, no vocals, no sound effects, no diegetic audio, no dialogue
```

**Key tokens:**

- `"close-mic'd felt-hammer upright piano"` — produces intimate mechanical-felt sound vs. concert-hall reverb. Essential for the register.
- `"silence between notes"` — ElevenLabs respects this and leaves breathing room. Critical for the "silence is the city" doctrine.
- `"final phrase fades unresolved"` — match cuts to black on the final shot, not at musical resolution.
- `"no vocals, no sound effects, no diegetic audio, no dialogue"` — defensive list per `feedback_elevenlabs_music_no_artist_names` memory.
- **NEVER** name a specific composer, artist, or producer — ElevenLabs ToS blocks it. The API returns a `prompt_suggestion` ready to resubmit if you slip up.
