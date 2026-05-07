# Music Video — Prompt Cookbook

Reusable patterns for generating music-video keyframe and i2v prompts that actually sync to the song. Treat this as the *grammar* sheet — the playbook reads it before writing prompts, the editor reads it before placing cuts.

---

## 1. Master prompt template (per scene)

Use this skeleton for every scene's keyframe + i2v prompt pair. Fill each slot with a single concrete choice; reject "various" or "dynamic" as filler.

```
[SCENE-NN | SECTION (verse / build / chorus / bridge / drop / outro) | t=START–END | bars=N]

STRATEGY MODE: [performance | narrative | abstract-visualizer]
GENRE: [hip-hop | pop | rock | EDM | R&B | lo-fi | jazz | classical | country | K-pop]

SUBJECT:
  - Who/what is in frame: [solo performer / band / dancer / object / pure-abstract]
  - Pose / action: [one verb, e.g. "leans into mic", "explodes outward", "walks slowly toward camera"]
  - Emotional read: [one adjective, e.g. "defiant", "wistful", "ecstatic"]

ENVIRONMENT:
  - Location archetype: [warehouse / studio cyc / rooftop / club / void / nature / abstract digital]
  - Surface / texture cue: [concrete, velvet, water, smoke, neon glass, film grain, etc.]

LIGHTING:
  - Key: [hard spotlight / soft top / rim only / silhouette / floodlit / strobe]
  - Color temperature: [tungsten warm 2700K / daylight 5600K / mixed / unnatural neon]
  - Palette anchors: [3 hex-or-named colors from the genre matrix below]
  - Hard shadows or soft? [hard / soft / none]

CAMERA:
  - Framing: [extreme close-up / close-up / medium / wide / extreme wide]
  - Lens feel: [35mm anamorphic / 50mm portrait / 85mm telephoto / wide 24mm / fisheye]
  - Movement: [locked / slow push / orbit / whip-pan / handheld / dolly-out / drone-down]
  - Speed: [real-time / slow-motion 50% / hyper 2x / freeze-frame / ramp]

BEAT-SYNC ANCHORS (this is the part most prompts skip):
  - Primary cut-in beat: [e.g. "land on first kick of bar 1"]
  - Within-clip beat events: [e.g. "subject blinks on snare beats 2 & 4", "color shifts on every downbeat"]
  - Energy curve inside clip: [flat / building / peaking / decaying]

NEGATIVE / NON-GOALS:
  - No: [list 3–5 things that would break the genre/strategy: "no candy colors", "no smiling", "no zoom-in", etc.]
```

The keyframe prompt (Gemini 3 Pro Image) uses the SUBJECT + ENVIRONMENT + LIGHTING + CAMERA framing slots. The i2v prompt (Kling v3.0 Pro) uses CAMERA movement + BEAT-SYNC ANCHORS to drive motion within the 5-second clip.

---

## 2. Beat-cut sync vocabulary

Words and phrases that survive the prompt → model translation. Use these literally; paraphrasing degrades sync quality.

### Cut-placement language
- `"land on the first kick of bar [N]"` — better than "start on the beat"
- `"hold for [N] bars then cut on the snare"` — beats are abstract; bars are concrete
- `"sustain across the build, release on the drop at t=[X]s"`
- `"hit on the downbeat"` (= beat 1 of the bar)
- `"accent on beats 2 and 4"` (= the snare in 4/4)
- `"every half-beat"` (= the hi-hat grid in standard 4/4)

### Within-clip motion language
- `"subject blinks once per bar, on the downbeat"`
- `"camera pushes forward at tempo — one bar per meter of travel"`
- `"particles burst outward on every kick"`
- `"color cycles to next palette anchor on every harmonic change"`
- `"frame holds locked-off on verse, breaks into orbit on chorus"`

### Energy-curve language
- `"static through the verse, builds in the pre-chorus, peaks at the drop"`
- `"slow motion 50% during the bridge, snaps to real-time on the final chorus downbeat"`
- `"cut rate doubles on the chorus" — paired with explicit per-section bar counts`

### Avoid
- `"dynamic editing"` — meaningless
- `"to the beat"` — too vague; specify which beat
- `"music video style"` — circular
- `"high energy"` — pair with a measurable cue (cut rate, particle count, light intensity)

---

## 3. Lighting recipes

Three dominant lighting contexts. Pick one per scene; switching mid-scene is a defect.

### A. Concert lighting (haze + lasers + strobe)
- **Key:** Multiple moving spotlights from above and behind. Hard.
- **Fill:** None or minimal. Negative space is part of the look.
- **Atmosphere:** Visible haze (atmospheric particulates), making light beams visible as cones.
- **Color:** 2–3 saturated neon hues (cyan + magenta + amber is canonical), lasers in primary green or red.
- **Strobe rule:** Strobes pulse on snare hits, not continuously.
- **Genre fit:** Rock, pop, EDM, K-pop, hip-hop arena.
- **Prompt fragment:** `"concert lighting: heavy stage haze, three moving spotlights from upstage in cyan and magenta, hard shadows on subject, single white follow-spot tracking the performer, occasional laser sweeps in green crossing behind"`

### B. Studio lighting (controlled, hero)
- **Key:** Single hard source 45° off-axis camera-left. Could be a Fresnel, a parabolic, or a ring.
- **Fill:** Soft fill 1.5 stops below key, or a black flag for full contrast.
- **Background:** Seamless cyc (white, black, or a saturated brand color), or a textured wall (concrete, brick, velvet drape).
- **Color:** Restrained — usually 1–2 hues plus neutrals. The subject is the spectacle, not the room.
- **Genre fit:** R&B, pop fashion, hip-hop styling shoots, classical.
- **Prompt fragment:** `"studio cyc shoot: deep red seamless background, single hard key from camera-left at 45°, no fill, subject in tight medium shot with hard rim from upstage carving silhouette"`

### C. Location lighting (natural, environmental)
- **Key:** Sun, practical lights in the location, or window light. Source is *in the world*, not added to it.
- **Fill:** Bounce off existing surfaces, or none.
- **Atmosphere:** Time of day matters: golden hour, blue hour, harsh noon, neon-night.
- **Color:** Whatever the location gives you. Don't fight it.
- **Genre fit:** Lo-fi, country, R&B intimate, indie, narrative-mode anything.
- **Prompt fragment:** `"location lighting: empty laundromat at 1am, motivated by overhead fluorescents (slight green cast) and the warm yellow of a single working dryer, no added lights, subject sitting on bench reading"`

### D. Abstract digital (no physical lights)
- **Key:** Emissive geometry, particle fields, volumetric fog with internal light sources.
- **Color:** Full neon palette permitted. Saturation 100%.
- **Atmosphere:** No physical world rules. Forms can self-emit, refract, or compose impossibly.
- **Genre fit:** EDM, electronic, visualizer mode for any genre.
- **Prompt fragment:** `"abstract digital space: emissive lattice of cyan tubes extending to infinity, glowing magenta particles drifting at tempo, no key light — every surface self-illuminates, deep black void background"`

---

## 4. Genre-mood matrix

Cross-reference at scenario stage. Cells are the canonical cookbook; document any deviation explicitly in the prompt.

| Genre | Palette anchors | Lighting | Cut rate (chorus) | Camera | Hook archetype |
|---|---|---|---|---|---|
| Hip-hop / Rap | Gold, deep red, black, occasional purple neon | Hard spotlight, hard shadows, urban practicals | 1 cut per beat | Whip-pans, low-angle, dolly-out | Whip-in reveal, beat-drop |
| Pop | Hot pink, cyan, sunshine yellow, white | Even bright, soft fill, candy | 1 per bar, accelerating | Spins, dolly-around, jib | Color-bath, slow-mo entrance |
| Rock / Metal | Deep red, black, orange (fire), gunmetal | Hard spotlights + strobe + practical fire | 1 per beat on chorus, ½-beat on solo | Handheld, headbang-shake, push-in | Single-frame flash, inverted |
| EDM / Electronic | Cyan, magenta, white, neon green | Abstract digital + lasers + haze | ½-beat during drop | Tunnel zoom, geometric orbit | Beat-drop, glitch-stutter |
| R&B / Soul | Warm gold, deep teal, brown, ember red | Candlelit / rim only / warm tungsten | 1 per 2 bars (intimate) | Slow push, locked-off | Slow-mo entrance, match-cut |
| Lo-Fi / Chill | Desaturated ochre, dusty teal, cream, warm grey | Natural window light, golden hour, film grain | 1 per 4 bars (long takes) | Locked-off or very slow pan | Hold-then-hit (rare), color-bath |
| Jazz | Deep purple, gold, smoky grey, black | Dim rim, smoky haze, single Fresnel | Improv — irregular, not metronomic | Graceful dolly, slow orbit | Match-cut, lyric-title (instrumental: skip) |
| Classical | Silver, gold, white, deep wood, nature green | Natural / spotlit hall, candle | Slow, on harmonic change | Crane, slow orbit, push on crescendo | Slow-mo entrance, top-down |
| Country | Golden hour orange, dusty brown, deep blue, cream | Sunset / sunrise / barn practicals | 1 per 2 bars | Wide slow pan, push on emotional line | Slow-mo entrance, color-bath |
| K-Pop | Vibrant rainbow, hot pink, electric blue, gold | High-contrast multi-source, neon, spotlit | 1 per beat on chorus, ½ on snare | Synced multi-cam, whip, spin | Whip-in, crowd-eye POV |

---

## 5. Common mistakes (and the fix)

### Mistake 1: Cuts placed on arbitrary frame numbers
**Symptom:** Editor places cuts at every 5s clip boundary regardless of where the beat is.
**Why it happens:** Composition logic doesn't read the beat grid; it just stitches clips end-to-end.
**Fix:** Extract beats from the track first (ffmpeg + aubio onset detection, or BPM × time math). Snap clip boundaries to the nearest beat. The clip may be trimmed to 4.7s or extended to 5.3s — that's correct, that's the point.

### Mistake 2: Verse and chorus look identical
**Symptom:** Same lighting, same framing, same cut rate across all sections.
**Why it happens:** Scenario was written before strategy mode + energy arc were declared.
**Fix:** Write scenario with section labels first. For each section, declare cut rate, framing band (CU/MS/WS), and lighting intensity. Verse must be visibly less than chorus.

### Mistake 3: Genre stated, palette ignored
**Symptom:** Brief says "hip-hop", prompts produce candy-colored pop visuals because that's what the model defaults to.
**Why it happens:** Genre tag wasn't pushed into palette anchors at the prompt level.
**Fix:** Always cite 3 explicit palette colors from the matrix in the LIGHTING block of the master prompt. Negative-prompt the off-genre defaults ("no candy colors, no pastel").

### Mistake 4: Drop visual is calmer than chorus
**Symptom:** Final chorus / drop is the loudest moment of the song but the visual is a single locked-off close-up.
**Why it happens:** Producer ran out of ideas; the chorus already used the "big" shot.
**Fix:** The chorus visual must leave headroom. Save one element (a new color, a new performer, a new location, a particle layer, fastest cut rate) for the drop only.

### Mistake 5: No hook in the first 2 seconds (short-form)
**Symptom:** First 2s is a slow fade-in, an establishing wide, or a logo card. Retention dies.
**Why it happens:** Long-form intuition applied to short-form.
**Fix:** Pick a hook from `hooks.md`. Fold it into scene 1 prompts. The musical anchor of the hook must exist in the first 2s of the track.

### Mistake 6: Performer reference photo missing for named-person video
**Symptom:** User says "music video for [Real Artist]"; producer generates with no reference; output has a generic AI face nothing like the real person.
**Why it happens:** Reference-required gate skipped.
**Fix:** Refuse at scenario stage with a concrete ask: "Upload a clear reference photo of [Artist] to `workspace/projects/<id>/assets/uploaded/`. Without it, this template cannot generate a recognizable likeness." This is a hard refuse, not a warn.

### Mistake 7: Beat-sync described in vague language
**Symptom:** Prompts say "high energy editing", "dynamic cuts", "to the beat".
**Why it happens:** Author hasn't internalized the beat-sync vocabulary in section 2.
**Fix:** Replace every vague intensity word with a measurable cue: cut rate per bar, color change per harmonic event, particle count per kick, camera movement velocity tied to BPM.

### Mistake 8: ElevenLabs Music brief without genre anchors
**Symptom:** User has no track; producer asks ElevenLabs for "a beat for the video" with no genre, BPM, or mood.
**Why it happens:** Skipping the music brief because "we'll see what comes back".
**Fix:** Music brief must specify: genre, BPM, mood, key/scale (if known), instrumentation, energy arc, and target duration. Treat the music call as a first-class prompt, not a side-effect.

---

## 6. Worked examples

### Example A — Hip-hop / Performance / Solo / Short-form (15s vertical)

**Track brief:** Trap beat, 140 BPM, 16-bar loop, hard 808 kick on every beat 1, hi-hats on every ¼-beat, vocal stab at bar 1.
**Hook:** Whip-in reveal (#1).
**Scene plan:**
- Scene 01 (0:00–0:02, 1 bar) — hook. Whip-pan from black to locked-off close-up of performer.
- Scene 02 (0:02–0:06, 2 bars) — verse. Medium shot, performer rapping, slow camera dolly-out, gold/black warehouse lighting.
- Scene 03 (0:06–0:11, 2 bars) — chorus. Wide shot, low angle, particle dust on every kick, hard cuts to extreme close-ups of jewelry on snare beats 2 & 4.
- Scene 04 (0:11–0:15, 2 bars) — outro / drop. Final 808 hit at 0:13: slow-mo close-up of mouth, then hard cut to black on the last kick.

**Scene 03 master-prompt fill:**
```
SCENE-03 | CHORUS | t=0:06–0:11 | bars=2
STRATEGY: performance | GENRE: hip-hop
SUBJECT: solo performer, mid-rap, defiant
ENVIRONMENT: warehouse, concrete floor, single overhead practical
LIGHTING: hard top-spot, no fill, hard shadows; palette: gold, deep red, black
CAMERA: low-angle wide on bar 1, whip-pan to extreme close-up of chain on bar 2 beat 2 (snare), 35mm anamorphic feel, handheld
BEAT-SYNC: cut on first kick of bar 1; particle dust burst outward on every kick (4 per bar); cut to chain CU precisely on bar 2 snare (beat 2)
NEGATIVE: no candy colors, no smiling, no soft fill, no slow camera
```

### Example B — EDM / Abstract Visualizer / 30s Loop

**Track brief:** Future bass, 150 BPM, build from 0:00–0:10, drop at 0:10, breakdown 0:18, second drop 0:24.
**Hook:** Beat-drop reveal (#2).
**Scene plan:**
- Scene 01 (0:00–0:05) — build. Low-rumble visual: dim cyan abstract field, particles slowly drifting upward. Color saturation climbs over 5s.
- Scene 02 (0:05–0:10) — pre-drop tension. Particles accelerate, geometric lattice begins forming, lattice tightens as build peaks.
- Scene 03 (0:10–0:18) — first drop. Lattice explodes outward into magenta + cyan tunnel, camera pushes through tunnel at 1 bar per length unit, particles burst on every kick.
- Scene 04 (0:18–0:24) — breakdown. Tunnel collapses, frame returns to near-black with single sustained magenta particle stream, cut rate drops to 1 per 4 bars.
- Scene 05 (0:24–0:30) — second drop. Re-explode, this time with a third color (white) added, faster cut rate (½-beat), zoom velocity doubled. Loop seam at 0:30 returns to scene 01 conditions.

### Example C — Lo-fi / Narrative / 60s YouTube Horizontal

**Track brief:** Lo-fi hip-hop instrumental, 75 BPM, 4-bar loop, light vinyl crackle, jazz piano + boom-bap drums.
**Hook:** Match-cut from reference (#10) — open on a vinyl record, match-cut to a city window.
**Scene plan:** Long takes, 1 cut per 4 bars (every ~12.8s). Five scenes total covering 60s. Each scene is a vignette of a character (student? night-shift worker? cat?) in a single warm-lit interior — bedroom, cafe, train, balcony, kitchen. Camera locked off or extremely slow pan. Warm golden grade, heavy film grain. No performer in frame, characters are narrative subjects. Outro is a held still on an empty mug, fading 1.5s.

---

## 7. Cost / model notes

- **Keyframes:** Gemini 3 Pro Image — one keyframe per scene. 4–12 keyframes typical, ~$0.04 each.
- **i2v:** Kling v3.0 Pro — 5s clips. Cost scales with clip count. A 30s short = 6 clips ≈ $1.50. A 60s loop = 12 clips ≈ $3.00.
- **Music (only if no track supplied):** ElevenLabs Music — one composition call, duration-priced. Spec the brief carefully; regen is expensive.
- **Beat extraction:** Free, ffmpeg + onset detection, runs in seconds. Always do this first when a track is supplied.
- **Quality gate:** Score scenario before generation — refuses if beat anchors / energy arc / genre palette aren't declared. Two failures → stop.

Always check `MODELS.md` for current model IDs before any call. Claude's training is stale.
