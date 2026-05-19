# Prompt Cookbook — UGC Selfie Product Review

All prompts use `{{slot}}` placeholders. Aesthetic descriptors stay literal — they are the template's DNA.

Slot legend in `template.json:slots`. Reference example values are pulled verbatim from `glitter-cream-001`.

---

## Stage 1 — Product master (locked super-original #1)

**Model**: `openai/gpt-5.4-image-2`
**Refs**: user-supplied product reference photo (real product OR first-pass AI gen the user has locked).
**Goal**: ONE shot. Best label/typography fidelity. Locked for the rest of the project.

```
Hyperrealistic studio product photo, vertical 9:16, perfectly centered straight-on frontal view of the SAME {{product_type}} from the reference image. Label remains identical to reference — '{{brand_name}}' printed directly on the {{product_surface}} in elegant hand-drawn calligraphic script (no background block), tiny tagline '{{product_name}}' below, delicate single-line {{brand_icon}} icon to the right.

INSIDE / VISIBLE FEATURE — {{product_signature_detail}}.
(Example for charm-inclusions: "suspended among the chunky holographic glitter and iridescent flakes are SEVERAL tiny floating cute charm-like shape inclusions: a small soft-pink butterfly silhouette, a tiny purple pastel pony silhouette (My Little Pony style), a tiny gold star, a tiny pink heart, a tiny white daisy flower, a tiny lilac cloud, a tiny mint moon. Each shape is ~5-7mm, opaque pastel solid colors, embedded throughout the gel as if floating in three-dimensional suspension. They are PLAYFUL CUTE shape inclusions clearly visible through the transparent walls — similar to charms floating inside a clear phone case.")

Clean {{background_color}} seamless paper background, soft diffuse studio key light from above, subtle shadow under {{product_type}}, premium editorial cosmetics packshot vibe — refined feminine aesthetic. Ultra-sharp text and shape edges. No other graphics, no stickers, no decals.
```

**Key tokens** (DO NOT genericize):
- `SUSPENDED AMONG` (analogy unlocks the inclusion physics)
- `similar to charms floating inside a clear phone case` (physics anchor)
- Enumerate the specific shapes with named colors. Vague "various cute shapes" does not render.

**Design language guardrails**: `premium minimalist cosmetics packaging in Glossier / Charlotte Tilbury style, NO sticker, screen-print directly on glass`. Sticker-style labels read "AI-cartoon" and get rejected first pass.

---

## Stage 2 — Persona master (locked super-original #2)

**Model**: `google/gemini-3-pro-image-preview`
**Refs**: user-supplied face selfie (real). Auto-data-URI'd via `--ref`.
**Goal**: ONE shot. Face / wardrobe / room locked for the rest of the project.

```
Hyperrealistic UGC selfie-style phone-camera photo of the SAME young woman from the reference image. Preserve EXACTLY: her face shape, {{hair_descriptor}}, {{glasses_or_not}}, fair skin, soft features. CRITICAL — keep the natural imperfect real-girl look from the reference: visible skin texture, faint freckles across cheeks and nose, no makeup, no AI smoothing, no airbrush, slight under-eye softness, individual hair strands a bit messy.

She looks DIRECTLY at the camera at eye level, head slightly tilted, neutral curious expression with lips just barely parted, both cheeks fully visible and unobstructed (she will later apply {{product_name}} to them). Hair half-down, a few strands falling around her face. She wears {{wardrobe}} (homewear, not styled).

Background: {{location_master_plate}}. Vertical 9:16, shallow depth of field, phone-camera selfie aesthetic, slight grain. No text, no logos, no caption overlay.
```

**Key tokens** (DO NOT genericize, applies to ALL real-human selfie gens):
- `CRITICAL — natural imperfect real-girl look`
- `no AI smoothing, no airbrush, visible skin texture, faint freckles`
- `individual hair strands a bit messy`

Without these, gemini-3-pro defaults to plastic-skin idealization even with user-supplied selfie ref.

---

## Stage 3 — Scene first-frame (per kling clip)

**Model**: `google/gemini-3-pro-image-preview`
**Refs**: BOTH locked masters (product master + persona master), in that order.
**Goal**: one first-frame per planned kling clip. Internals MUST appear here, not just in the kling prompt.

```
Hyperrealistic UGC TikTok first-frame, vertical 9:16, intimate selfie phone-camera angle. The SAME young woman from the SECOND reference image — preserve exactly: her face, {{hair_descriptor}}, {{glasses_or_not}}, faint freckles, natural imperfect skin texture (no AI smoothing, no airbrush), {{wardrobe}}. She is in {{location_master_plate}}.

She holds the SAME {{product_type}} from the FIRST reference image up near her chin — the {{product_type}} occupies the lower half of the frame, label readable.

INSIDE / VISIBLE FEATURE — {{product_signature_detail}} clearly visible through {{product_surface}}. (Repeat the enumeration from Stage 1 — kling needs to see them on T0.)

Her face is in the upper third, looking DIRECTLY into the camera lens at eye level with a curious neutral expression, lips slightly parted as if about to start speaking.

Soft natural afternoon light, shallow depth of field, slight grain, smartphone selfie cam realism, no captions, no text overlays.
```

---

## Stage 4 — Kling video gen (single-call multi-shot)

**Model**: `kwaivgi/kling-v3.0-pro`
**`--audio`**: `true` for `{{target_language}} = English`. `false` for non-English (+ ElevenLabs post-hoc).
**Refs**: scene first-frame as the i2v anchor.
**Cap**: 2300 chars (gate locally before submit).
**Goal**: one 6-9s clip per beat, with 1-2 internal HARD JUMP CUTs.

```
9:16 TikTok handheld selfie UGC, {{duration}}s, {{shot_count}} shots with {{cut_count}} HARD JUMP CUT(S) at {{cut_timestamps}}. No crossfade. Subject (locked): {{influencer_persona}}, {{wardrobe}}, {{location_master_plate}}. {{product_type}} ({{brand_name}} {{product_name}}, {{product_visual_id}}).

INSIDE / VISIBLE FEATURE (visible all shots, preserve from first-frame): {{product_signature_detail}}. {{internals_motion_descriptor}} (e.g. "Charms drift slowly with jar motion.")

VIBE: relaxed unhurried GRWM, slow chill cosmetics influencer pacing. NOT rushed, NOT excited. Calm curiosity, long natural breaths.

SHOT 1 ({{t0}}-{{t1}}s, matches first-frame): {{shot_1_description}}. SAYS slow chill with pause: '{{vo_line_1}}'

HARD JUMP CUT {{t1}}s.

SHOT 2 ({{t1}}-{{t2}}s): {{shot_2_description}}. SAYS slow chill: '{{vo_line_2}}'

HARD JUMP CUT {{t2}}s.

SHOT 3 ({{t2}}-{{t3}}s): {{shot_3_description}}. SAYS soft amused with breath: '{{vo_line_3}}'

VOICE TAGS (same person all shots): {{voice_tag_block}}

AUDIO: {{per_shot_sfx_line}}. STRICTLY FORBIDDEN: NO music, NO instrumental, NO soundtrack, NO melody, NO singing, NO percussion.

STYLE: phone-camera UGC realism, slight grain, handheld selfie jitter, shallow DOF, no captions, no text overlays.
```

### Default voice-tag block (English)

```
young american female ~22yo, soft-medium pitch, light vocal fry, intimate UGC close-mic, RELAXED chill curious tone at UNHURRIED slow conversational pace, GRWM-like, no theatrical surprise, no rush, soft natural breaths between phrases, no accent.
```

Paste identically across all clips. Validated ~80-90% voice match between separate kling calls.

### When the action drifts (drift-recovery prompt fragment)

If kling collapses a near-face action to "powder-compact stamping" once, add ONE retry with:

```
CRITICAL DO NOT: {{product_type}} never touches face. No powder-compact stamping. No fingernail tapping on {{product_type}}. {{product_type}} floats at arms length the entire shot.
```

If that fails too, **change the scene**. Don't keep prompting against the drift.

---

## Stage 5 — ElevenLabs bg music

**Model**: `music_v1`
**Mode**: `force_instrumental: true`
**Length**: matches render duration (e.g. `17000` ms for 17s).
**Goal**: 3 vibe variants, user picks one.

Prompt template (vary `{{music_vibe}}` across the 3 generations):

```
{{music_vibe}}, {{instrumentation}}, {{tempo_descriptor}}, intimate cozy GRWM beauty vlog vibe, calm and unhurried, no vocals, no lyrics
```

Three concrete variants used in source project:

- **lofi**: `Soft lo-fi bedroom instrumental, gentle muted piano keys, warm analog pad, very subtle brush percussion, dreamy nostalgic chill, 80 BPM, intimate cozy GRWM beauty vlog vibe, calm and unhurried, no vocals, no lyrics`
- **sparkle-pop**: `Bright sparkle-pop instrumental, soft synth pluck, glittery bell arpeggio, gentle bass tap, dreamy cute beauty vlog energy, 95 BPM, light feminine cosmetics-haul vibe, no vocals, no lyrics`
- **acoustic**: `Cozy acoustic instrumental, fingerpicked nylon-string guitar, soft brush drums, warm room reverb, calm sunlit afternoon mood, 78 BPM, intimate GRWM beauty vlog vibe, no vocals, no lyrics`

**ToS reminder** (memory: `feedback_elevenlabs_music_no_artist_names`): no named-artist / named-producer references. Genre + tempo + instrumentation only. API returns `prompt_suggestion` on rejection — resubmit verbatim.

---

## Fragments worth keeping verbatim

These appear across the cookbook with high reuse — paste them in, don't rewrite.

### Music-ban block (every kling prompt)

```
STRICTLY FORBIDDEN: NO music, NO instrumental, NO soundtrack, NO melody, NO singing, NO percussion.
```

### Real-girl skin block (every persona / scene-frame gen)

```
visible skin texture, faint freckles, no makeup, no AI smoothing, no airbrush, slight under-eye softness, individual hair strands a bit messy
```

### Style register tail (every image gen)

```
phone-camera UGC realism, slight grain, handheld selfie jitter, shallow DOF, no captions, no text overlays
```

### Hard-jump-cut trigger phrasing (kling)

```
NOT one take. {{N}} shots with {{N-1}} HARD JUMP CUT(S) at {{t1}}s, {{t2}}s. No crossfade. No blur transition.
```
