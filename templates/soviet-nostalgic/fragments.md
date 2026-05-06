# Prompt fragment library

Reusable building blocks to compose prompts for `gemini-3-pro-image-preview` (keyframes), `kwaivgi/kling-v3.0-pro` (motion), ElevenLabs Music (background beds), and ElevenLabs `eleven_multilingual_v2` (VO settings).

**How to use:** these aren't templates with blanks to fill. They're proven phrases that reliably hit the vibe. Copy the style/quality fragments verbatim. Adapt the character/product fragments by substituting the concrete descriptor from your new project (the reference photo + any specific details — don't invent adjectives).

Compose like:
```
<scene-specific action prompt> + <character descriptor from the reference photo> + <product descriptor> + ANATOMY + SOVIET_STYLE (or MODERN_STYLE) + NO_FRAME
```

**Always append `NO_FRAME` to image prompts.** Without an explicit instruction, the image model tends to add a beige archival matte with "СВЕМА 35 / ФОТОГРАФИЯ" text along the edges (it treats any Soviet vibe cue as license to draw the artifact surround). We want the Svema *grain and palette* but the full 9:16 frame for the photograph itself.

## Style

**NO_FRAME** — the image must fill the whole 9:16 canvas edge-to-edge, no archival border around it.
> Full-bleed 9:16 photographic frame with no decorative border, no beige/cream/paper matte around the image, no Cyrillic text along the edges, no 'СВЕМА 35' text, no 'ФОТОГРАФИЯ' text, no passport-photo border, no sprocket holes. The photograph itself fills the entire canvas from edge to edge.

**SOVIET_STYLE** — always append `NO_FRAME`
> Warm amber Svema 35mm film grain embedded in the photograph itself, heavy soft grain, muted palette of olive, ochre, cream and warm red. Tungsten light sources. Documentary realism, photorealistic. The grain and warm palette are inside the image; the image has no printed border or matte around it.

**MODERN_STYLE**
> Contemporary editorial photography, cold neutral studio light, sharp focus, clean quiet composition, muted desaturated palette, raw grey concrete and matte black surfaces. No film grain, no vintage filters, no decorative border, full-bleed to frame edges.

## Characters

The pattern is: **short concrete description of the character from the reference photo + "Preserve identity exactly."** Don't invent features that aren't visible in the ref photo — `gemini-3-pro-image-preview` treats the ref as gospel but will drift if you add contradicting adjectives.

### Example from solutions-metal-001 — inventor (grandfather)

Used in keyframes for scenes 1, 2, 4 where the Soviet-era character appears. The image call took the generated grandfather portrait as the first `--ref` URL.

> the Soviet textile engineer in his mid to late fifties from the reference photo — same face, same greying hair combed back, same deep-set tired intelligent eyes, round wire-frame glasses, trimmed greying moustache, weathered face, white laboratory coat over grey shirt and thin dark tie. Preserve his identity exactly.

Structure: `the <role> in his <age> from the reference photo — <2-3 most distinctive visual features>, <wardrobe>. Preserve his identity exactly.`

### Example from solutions-metal-001 — modern heir (Gleb)

Used in keyframes for scenes 6, 7, 8. `image_urls` included 3 real photos of Gleb (front, 3/4, Adidas jacket).

> Gleb Kostin — the young slim man in the reference photos in his mid-twenties with messy medium-length layered brown hair with subtle blond highlights falling heavily over his forehead and partly covering his eyes, pale skin, thin delicate jawline, faint light moustache. Preserve his face and hairstyle identity exactly.

Structure: `<real name> — the <age/build> person in the reference photos with <2-3 most distinctive visual features>. Preserve face and hairstyle identity exactly.`

**Adaptation rule:** just look at the ref photos and describe the 2–3 most distinctive visible features. Don't extrapolate.

## Product

The pattern is: **tactile physical description grounded in material reality**, not brand-speak.

### Example from solutions-metal-001 — the fabric

> heavily crumpled and densely wrinkled matte-black fabric with a faint metallic sheen, permanent sharp creases going in every direction, as if thick aluminum foil was compressed and laminated with black cotton, holding its shape independently

What makes it work: concrete materials (aluminum foil + cotton), observable properties (crumpled, wrinkled, creases, sheen), and one analogy ("as if thick aluminum foil was compressed and laminated..."). Models visualize all three. Vague descriptors ("innovative fabric", "advanced material") don't.

**Adaptation rule:** describe your product as a physicist or tailor would — what is it made of, what does light do on it, how does it behave when touched or moved. Skip the marketing register.

## Quality guards

**ANATOMY** — anti-deformation
> Photorealistic natural human anatomy with exactly five fingers per visible hand. No extra fingers, no deformed limbs.

**QUALITY_TAIL** — broad quality constraints (for text2img models without strong priors)
> Photorealistic, natural human anatomy with exactly five fingers per hand. Realistic hands are critical. No extra fingers. No deformed limbs. No warped text. If any Russian Cyrillic text appears, it must be clearly legible and correctly spelled.

## Video-specific suffixes

**PRESERVE_SOVIET** — tail for i2v prompts on Soviet-era clips
> Preserve the warm amber Svema 35mm film grain and tungsten palette from the start image. Full-bleed photographic frame, no added border, no Cyrillic text overlay along the edges. No camera movement unless explicitly stated.

**PRESERVE_MODERN** — tail for i2v prompts on modern-era clips
> Preserve the cold neutral editorial studio look from the start image. Sharp focus, clean quiet composition, no grain.

## Kling negative prompts

**NEGATIVE_VIDEO_BASE** — always include for silent i2v (we don't want native TTS trying to speak anyway)
> blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, warped hands, extra fingers, archival frame border, Cyrillic text along edges, beige photo matte, paper border, passport-photo frame, СВЕМА 35 text, ФОТОГРАФИЯ text

**NEGATIVE_SOVIET** — additional for era-1 clips
> modern objects in Soviet scenes, plastic, electric modern lighting, archival frame border around image, beige or cream matte, Cyrillic text printed along image edges

**NEGATIVE_MODERN** — additional for era-2 clips
> film grain, vintage look, archival border, sepia, warped branding

## Music

### Soviet bed — use the canonical track, don't generate

**Required:** `templates/soviet-nostalgic/assets/trend-soviet-bed.mp3` (60s). This is a TikTok trend audio that viewers recognize — part of why the format stops scrolls. The track is auto-copied into the project's `assets/music/` at scaffold time (`ralphy template use` reads `template.json → assets`). See the Music section in [TEMPLATE.md](TEMPLATE.md) for details.

**Do not replace it with a generated bed.** A "similar vibe" track loses the recognition signal that's load-bearing for the format.

For reference only — the generation prompt used on the very first version before we switched to the canonical track. Keep this as a fallback only if the canonical track becomes unavailable, with the expectation of a noticeable loss in trend recognition:

> (fallback) Instrumental background score, nostalgic Soviet-era atmosphere, 1970s Soviet documentary film style. Slow tempo around 60 BPM, minor key, warm analog synthesizer pads with subtle tape hiss, soft sustained strings, occasional distant accordion touches, very gentle melancholy but reflective and dignified — not sad. Quiet and unhurried, suitable as a background score behind a calm male voice-over narration. No vocals, no lyrics, no drums, no percussion hits, no strong melodic hooks. Must stay subtle and atmospheric so a voice-over sits clearly above it. Long sustained chords, slow evolving texture, analog warmth, low register emphasis.

> (fallback negative) low quality, loud drums, strong percussion, aggressive beats, vocals, singing, lyrics, rap, electric guitar solo, dubstep, modern EDM, fast tempo, distortion, loud brass, jazzy swing, heavy bass drops

### Hip-hop bed — generate via ElevenLabs Music (or user-provided)

The modern-era half (after the DJ-drop) is less trend-bound. Any confident dark trap instrumental works.

**HIPHOP_BED_PROMPT**
> Modern dark hip-hop instrumental, heavy 808 trap bass, moody minimalist beat around 80 BPM, confident contemporary fashion-brand vibe, atmospheric lo-fi texture with subtle synth pad, clean punchy kick that hits hard on the one, no vocals, no lyrics, no ad-libs, no singing, no human voice, purely instrumental

**HIPHOP_BED_NEGATIVE**
> vocals, lyrics, singing, rapping, ad-libs, human voice, talking, whispers, cheerful pop, upbeat rock, orchestral, jazz, country

## ElevenLabs voiceover

### Voice settings (deadpan young Russian narrator)
```json
{
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.55,
    "similarity_boost": 0.8,
    "style": 0.25,
    "use_speaker_boost": true
  }
}
```

### Voice character
Male, around 25 years old, deadpan delivery — calm, measured, unhurried. No broadcaster energy, no selling tone, no theatricality. Warm middle register, slightly dry timbre, introspective. Should sound like a craftsman telling a family story to a friend.

Voice pick matters. Default library voices like clyde-warvet, dave-british-mature, daniel-deep were all too theatrical / too mature and broke the vibe. Use a user-owned clone or a voice that sounds like a real 25-year-old Moscow designer.

### Writing the VO lines

Don't treat the reference VO as a template to refill. Treat it as a vibe reference. Read the 8 lines in [reference-example.md](reference-example.md) — they're deliberately varied in length (10–30 words), use short sentences at emotional peaks, and land on specific dates/objects/verbs.

What to copy from the reference vibe:
- **Deadpan register.** No exclamation marks, no hype vocabulary, no first-person enthusiasm.
- **Sentence-length variation.** A 25-word setup followed by "Закрыли." lands harder than two 15-word sentences.
- **Concreteness.** Name the year, the institute, the material, the specific reason for rejection.
- **Possessive framing.** "Мой дед был…" / "Мы достали её…" — the narrator has a stake in the story.
- **Ending on the brand/product name** as the final word, preceded by a short structural echo of the video's shape.

What to decide fresh per project:
- How many clips (6–10 typical) — let the story tell you
- Line length per clip — aim for `line_words × 0.45s + 0.5s buffer ≈ clip_duration_sec`
- Which beats matter most — expand them, compress the others
- The exact tagline — echo the video's shape in 3–5 words, don't reuse "Одна идея. Две эпохи."

### Generation pattern

Generate N per-scene mp3s (one per clip) + 1 full-master mp3 (all lines concatenated with `\n\n` for natural pauses). Use `mp3_44100_128` output format. Call sequentially — ElevenLabs starter/free plans cap at 3 concurrent and will 429 otherwise.

Send `User-Agent: Mozilla/5.0 (...)` header — default Node UA gets Cloudflare-403'd.
