# Prompt cookbook — photo-dump

Reusable building blocks for `/ralph-art-director` and `/ralph-editor`. Combine fresh per project; never paste verbatim.

This format is photo + beat-sync only — no i2v, no kling, no veo. Skip the video-generation pipeline entirely. The work is in (a) photo cohesion and (b) beat-snap timing.

## 1. Master template (one prompt → cohesive set of N photos)

When generating an AI photo set, do NOT issue N independent prompts — issue **one master aesthetic block** + **N short scene-specific tails**. This is the single biggest cohesion lever.

**Master aesthetic block** (reused verbatim across all N photos):

> "35mm film stock, Kodak Portra 400 grade, soft golden-hour light, slight warm cast, fine grain visible in shadows, candid framing, slight motion blur acceptable, off-center subject, no studio lighting, no model-look, no text in frame, no logos, no watermarks, 9:16 vertical, 1080×1920."

**Scene-specific tail** (one line per photo, varies):

> "Subject: <thing>. Setting: <place>. Action: <what's happening>."

Concrete example for an "October dump" of 12 photos — same master block, 12 different tails:

1. "Subject: a hand holding a paper coffee cup. Setting: a wooden cafe table by a window. Action: steam rising."
2. "Subject: a pair of suede boots. Setting: a leaf-strewn sidewalk. Action: mid-step from above."
3. "Subject: a bookshop window. Setting: cobblestone street, evening. Action: a passerby in soft focus."
4. (...etc)

Pass each prompt to `ralphy generate image --slot photo-NN --prompt "<master> <tail>" --size 1080x1920`. Twelve calls, one master, twelve tails — same look across all twelve.

## 2. Photo prompt vocabulary (cohesive aesthetic)

Pick **one** value from each axis and keep it constant across the entire dump. Mixing values is the #1 cohesion killer.

| Axis | Options (pick one) |
|---|---|
| Film stock | Kodak Portra 400 / Kodak Gold 200 / Fuji Pro 400H / CineStill 800T (night) / digital-clean (rare — most dumps want grain) |
| Time of day | golden hour / blue hour / overcast midday / interior tungsten / night neon |
| Color cast | warm-amber / cool-cyan / muted-pastel / desaturated-earth / high-contrast-saturated |
| Grain level | fine grain / heavy grain / clean (digital) |
| Framing | candid handheld / centered formal / off-center rule-of-thirds / overhead flat-lay |
| Subject distance | close-up / medium / wide |

**Niche presets** (good defaults for the four worked examples below):

- **Travel dump** — Kodak Portra 400, golden hour, warm-amber, fine grain, candid handheld, varied distance.
- **Brand week-recap** — digital-clean (or very fine grain), interior tungsten + window light, warm-amber, centered formal, varied distance.
- **Aesthetic / autumn cottage** — Kodak Gold 200, overcast midday, desaturated-earth, fine grain, off-center rule-of-thirds, varied distance.
- **Product week-recap** — digital-clean, soft daylight, muted-pastel, no grain, overhead flat-lay + medium, varied distance.

## 3. Beat-sync rules (the load-bearing craft)

This is what separates a photo-dump from "a slideshow with music."

**Rule 1 — snap on every kick or snare.** Find the BPM of the bed (`ralphy doctor music-bpm <track>` or eyeball it in any DAW). At 110 BPM, a beat is 0.545s. Each photo's `durationInFrames` = `Math.round(60 / BPM * FPS)` for a one-photo-per-beat steady pacing. At 30fps + 110 BPM that's 16 frames per photo.

**Rule 2 — ramp pacing in the chorus.** When the music's energy lifts (chorus, drop, bridge), double the photo density: switch from one-photo-per-beat to one-photo-per-half-beat. The photos *feel* the music. Concretely: chorus photos run at 8 frames each instead of 16.

**Rule 3 — final photo holds 1-2 beats longer.** The closer photo gets `2 × beatFrames` (32 frames at 110 BPM / 30fps) — a deliberate hold that ends the dump on a frame. Hard cut to black after, no fade.

**Rule 4 — opening text overlay holds for 1-1.5s** (not a full beat, not a beat-snap). It sits *on top of* photo 1 (and sometimes photo 2), fading out before the chorus density kicks in. The text is not on the beat — the photos are.

**Rule 5 — never a transition longer than 4 frames.** A snap-cut is 0 frames. A push or vinyl-flip should be 2-4 frames max. Anything longer (a 30-frame fade, a slow dissolve) destroys the snap-on-beat feel and turns the dump into a slideshow.

## 4. Music selection

**First choice: a trend track.** Photo-dumps live on the music currently doing the rounds. Provide:
- the file (licensed or platform-supplied),
- the BPM (Spotify / Songdata.io will tell you),
- the downbeat offset in seconds (where beat 1 lands — used to align the first photo's snap).

**Fallback: ElevenLabs Music.** When the trend track is not licensable for the deliverable:

```bash
ralphy generate music \
  --project <id> --slot music-bed \
  --prompt "lo-fi hip-hop instrumental, 90 BPM, four-on-the-floor kick, soft vinyl crackle, no vocals, no melody hooks, looped" \
  --duration 28
```

ElevenLabs Music presets that pair well with the niches:

| Niche | Prompt |
|---|---|
| Travel | "warm acoustic indie folk, 100 BPM, finger-picked guitar, soft brushed drums, no vocals" |
| Lifestyle / aesthetic | "lo-fi hip-hop instrumental, 90 BPM, vinyl crackle, soft Rhodes piano, no vocals" |
| Fashion | "downtempo electronic with 808s, 95 BPM, sparse synth, no vocals" |
| Brand week-recap | "uplifting cinematic ambient, 75 BPM, light piano + strings, no vocals" |
| Product week-recap | "modern minimal pop instrumental, 105 BPM, plucked synth, soft kick, no vocals" |

Always request a duration **slightly longer** than the video (28s for an 18s video) — the extra tail gives Remotion room to land the last beat cleanly without a hard cutoff.

## 5. Transition styles

Default is **snap-cut** (0 frames). Use other transitions sparingly — ideally only on chorus accents, not throughout.

| Style | When | Frames |
|---|---|---|
| Snap-cut | default — 90% of transitions | 0 |
| Push (left / right / up / down) | chorus accent or scene-change within a niche (e.g., switching from cafe interior shots to outdoor walk shots) | 2-3 |
| Vinyl-flip (3D card flip) | rare — once per dump max, on the closer's entry | 4 |
| Dissolve | discouraged — only on a very slow ambient bed (≤75 BPM) | 4 |

A photo-dump that uses three different transition types throughout reads as over-edited. The *photos* and the *music* carry the variety; the transitions stay invisible.

## 6. Six common mistakes

1. **Photos lack cohesion.** Mixing iPhone snapshots with DSLR photos with AI-generated images without a shared aesthetic vocabulary. Reads as a Google Drive folder, not a dump. **Fix:** force a single film-stock + grade + time-of-day across the entire set.
2. **Transitions not on the beat.** Photos drift slightly off-beat — at 110 BPM, even 2 frames of drift accumulates to a full beat over 12 photos and the whole video feels broken. **Fix:** snap each photo's `from` frame to the nearest beat using `Math.round(beatIndex * 60 / BPM * FPS)`, never a hand-tuned offset.
3. **Too many photos in too little time.** 16 photos in 10s = 0.625s each, no breathing room. The viewer cannot register a single image. **Fix:** either drop to 10 photos or extend to 16-20s.
4. **Opening text too long.** A full sentence reads as a caption, not a hook. "Here are some photos from my recent trip to Lisbon, Portugal" kills the format. **Fix:** 1-7 words. See `hooks.md`.
5. **Two music tracks / cross-fade.** Photo-dumps live on a single bed. Cross-fading to a second track halfway breaks the "single mood board" feeling and reads as a music video. **Fix:** one track, full duration, no fades.
6. **Studio-clean AI photos.** Generating with the default `gemini-3-pro-image-preview` look (clean, well-lit, sharp) produces photos that look like stock images, not a dump. **Fix:** force the master aesthetic block in section 1 — film stock, grain, candid framing.

## 7. Worked examples

### Example A — Travel dump, "Lisbon weekend"

- **Photo source:** user-supplied (12 phone photos from a 3-day trip).
- **Hook:** "POV: you live in Lisbon for a month." (Pattern #9 from `hooks.md`.)
- **Photos:** tile-floor café, tram in motion, peeling-paint doorway, balcony with laundry, vinho verde glass, river at dusk, tram cables at golden hour, pastel de nata close-up, narrow stairs, a stranger's silhouette in alley, sardines on a plate, sunset over the Tagus.
- **Music:** licensed indie-folk track, 100 BPM. (Or ElevenLabs fallback: "warm acoustic indie folk, 100 BPM, finger-picked guitar, soft brushed drums, no vocals".)
- **Pacing:** ramped — first 4 photos at one-per-beat (16 frames each), middle 6 at one-per-half-beat (8 frames each, in the chorus), last 2 photos held 32 frames each.
- **Total:** 18s, 12 photos, 1 opening text overlay (1.2s on photo 1).
- **Cost:** $0 (user photos + licensed track).

### Example B — Brand week-recap, cafe brand "Roastery 7"

- **Photo source:** user-supplied (14 photos from a single week of operations).
- **Hook:** "Week 12 at Roastery 7." (Pattern #8.)
- **Photos:** latte art top-down, regular's hand on a mug, new croissant on parchment, chalkboard with the week's specials, sunset through the front window, barista mid-pour, beans pouring into the grinder, a stack of empty cups, the team after close, a kid laughing at the counter, a delivery van outside, the door closed at end-of-day with a "see you tomorrow" sign, the cleaned counter, an empty street view.
- **Music:** ElevenLabs Music — "uplifting cinematic ambient, 75 BPM, light piano + strings, no vocals", duration 25s.
- **Pacing:** steady — 14 photos at one-per-beat (24 frames each at 75 BPM / 30fps), last photo held 48 frames.
- **Total:** 21s, 14 photos, 1 opening text overlay (1.5s).
- **Cost:** $0 (user photos + ElevenLabs subscription).
- **Note:** brand week-recaps benefit from a single human face appearing 2-3 times (the regular, the kid, the team) — turns the dump from a brand-asset spread into a community vlog.

### Example C — Aesthetic dump, "autumn cottage"

- **Photo source:** AI-generated, no real cottage exists — pure aesthetic mood.
- **Hook:** "An ode to autumn." (Pattern #3.)
- **Master aesthetic block:** "Kodak Gold 200 film stock, overcast midday light, desaturated-earth palette, fine grain, off-center rule-of-thirds, candid framing, slight handheld blur, 9:16 vertical."
- **Photos (10 tails):**
  1. "Subject: a wool blanket draped on a wooden chair. Setting: cottage porch. Action: still."
  2. "Subject: an open book face-down. Setting: window seat with a fogged pane. Action: still."
  3. "Subject: pumpkins on a stone step. Setting: cottage doorway. Action: still."
  4. "Subject: a steaming mug of tea. Setting: kitchen counter with a wooden spoon. Action: steam rising."
  5. "Subject: knitted socks on a rug. Setting: by a fireplace. Action: still."
  6. "Subject: dry leaves in a cupped hand. Setting: outdoor path. Action: leaves falling."
  7. "Subject: a candle flame close-up. Setting: dark wooden table. Action: flicker."
  8. "Subject: rain on a windowpane. Setting: viewed from inside, blurred trees outside. Action: drops sliding."
  9. "Subject: a slice of apple pie. Setting: ceramic plate, fork beside it. Action: still."
  10. "Subject: a wide shot of the cottage exterior. Setting: forest clearing at dusk. Action: still."
- **Music:** ElevenLabs Music — "lo-fi hip-hop instrumental, 90 BPM, vinyl crackle, soft Rhodes piano, no vocals", duration 22s.
- **Pacing:** steady — 10 photos at one-per-beat-and-a-half (30 frames each at 90 BPM / 30fps), last photo held 60 frames.
- **Total:** 17s, 10 photos, 1 opening text overlay (1.4s).
- **Cost:** ~$1.50 (10 × gemini-3-pro-image-preview).

### Example D — Product week-recap, skincare brand showcasing 7 products

- **Photo source:** AI-generated, but with the user's product packaging supplied as `--ref` for every photo where a product is visible (so labels stay accurate). 7 product photos + 5 contextual photos = 12 total.
- **Hook:** "7 things I cannot live without." (Pattern #5 variant — list framing.)
- **Master aesthetic block:** "digital-clean, soft daylight from a north-facing window, muted-pastel palette, no grain, overhead flat-lay or close-up medium, 9:16 vertical."
- **Photos:**
  1. (Contextual) "Bathroom counter at sunrise, a towel half-folded, a faint shadow of a plant." — overlay text: "7 things I cannot live without."
  2. (Product 1, with `--ref`) "Cleanser bottle on a marble counter, a single drop of water on the label, top-down."
  3. (Product 2, with `--ref`) "Toner bottle held mid-air against a pastel wall, a single drop falling."
  4. (Contextual) "A hand reaching for a mirror, blurred."
  5. (Product 3, with `--ref`) "Serum dropper close-up, a bead of serum forming."
  6. (Product 4, with `--ref`) "Moisturizer jar open, a finger lifted with a small swirl of cream."
  7. (Contextual) "A bedroom with morning light hitting a vase."
  8. (Product 5, with `--ref`) "Eye cream tube on a folded linen towel."
  9. (Product 6, with `--ref`) "SPF bottle on a rattan tray with a pair of sunglasses."
  10. (Product 7, with `--ref`) "Lip balm held between two fingers, in front of a soft pastel wall."
  11. (Contextual) "All seven products lined up on the counter, slightly out of focus."
  12. (Closer) "A satisfied face turned slightly away from the mirror."
- **Music:** ElevenLabs Music — "modern minimal pop instrumental, 105 BPM, plucked synth, soft kick, no vocals", duration 24s.
- **Pacing:** steady — 12 photos at one-per-beat (17 frames each at 105 BPM / 30fps), last photo held 34 frames. Opening text on photo 1 (1.5s).
- **Total:** 20s, 12 photos, opening overlay.
- **Cost:** ~$1.80 (12 × gemini-3-pro-image-preview, with `--ref` on the 7 product photos).
- **Critical:** even though this template's `requiresUserReference` is `false`, the moment any specific product / brand appears, the AGENTS.md hard rule #3 reference gate applies — the user MUST supply packaging photos for the 7 products, or the format refuses. AI-improvised packaging on a real brand is never acceptable. Switch to a generic / unbranded aesthetic dump if no references are available.

## 8. Negative prompt (default)

> "no studio lighting, no model-look, no plastic skin, no over-saturated colors, no cluttered backgrounds, no logos in frame (unless from supplied reference), no text overlays in source frame, no watermarks, no AI-improvised branding."

Append per project as the cohesion gate dictates (e.g., "no warm tones" if the dump is intentionally cool-cyan).

## 9. When generation fails — fallback ladder

If `gemini-3-pro-image-preview` produces incoherent photos:

1. **Strengthen the master aesthetic block.** Add concrete camera ("shot on Contax T2"), concrete lens ("35mm f/2.0"), concrete light source ("single window, north-facing").
2. **Drop photo count.** 8 cohesive AI photos beat 14 incoherent ones.
3. **Mix in user photos.** Even 4-5 user photos sprinkled into an AI-generated set anchor the cohesion.
4. **Switch to a real photo-dump source.** If the brief doesn't actually need fictional photos, ask the user for a folder of real photos and skip generation entirely. The format is at its best with real photos anyway.
