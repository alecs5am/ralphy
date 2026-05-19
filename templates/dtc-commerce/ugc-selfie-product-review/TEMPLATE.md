# UGC Selfie Product Review

> Intimate handheld 9:16 selfie review of one consumer product. Single influencer-persona, their own room, relaxed unhurried GRWM pacing. The mechanic is **identity-lock via two master shots passed as `--ref` on every gen** — without it, identity drifts between scenes and the UGC illusion collapses.

Derived from `glitter-cream-001` (Fluttershy holographic glitter cream, 17.2s shipped, $13.79 spent — would land $6-7 with the rules below).

## Vibe

- **Register**: phone-camera UGC realism, handheld selfie jitter, slight grain, shallow DOF, no text overlays, no captions.
- **Persona**: ONE influencer in their own bedroom, homewear (pajama / hoodie), no makeup, real-girl imperfect skin (freckles + visible pores). NOT styled, NOT salon-perfect. The aesthetic is "girl I went to college with reviewing the thing she just got delivered."
- **Pacing**: relaxed unhurried GRWM. Calm curiosity. NOT excited, NOT rushed. Long natural breaths between phrases. Conversational tempo at half-speed.
- **Mechanic**: optionally borrow ONE viral micro-trope from your reference video (e.g. specificity bait via visible internals — pony/butterfly/star floating inside transparent gel). Port to the new product before scene gens, not during.

## Key rules (every rule paid for in real iteration cost)

1. **Lock product + persona super-originals BEFORE any scene gen.** Generate ONE product master + ONE persona master, get user lock on both, then pass BOTH as `--ref` on every downstream `ralphy generate image|video`. Source-project cost of skipping this: $0.70 in master regens + $1.61 of scene rerenders when identity drifted mid-session.
2. **`--audio` on `kwaivgi/kling-v3.0-pro` renders speech + SFX cleanly for English.** Trust the playback, not the RMS reading — intimate UGC selfie audio is naturally quiet (-20 to -25 LUFS). For Russian / non-English: audio off, ElevenLabs `eleven_multilingual_v2` post-hoc (memory: `feedback_kling_no_ru_audio`).
3. **Kling honors internal HARD JUMP CUTs at named timestamps (~0.2s precision).** ONE kling call can carry 2-3 internal shots with hard cuts — no Remotion splice needed when the shot sequence fits in 2300 chars. Trigger phrases: "NOT one take", "THREE shots with TWO HARD JUMP CUTS at X.Xs and Y.Ys", "No crossfade, no blur transition".
4. **Kling prompt cap = 2500 chars server-side; gate locally at 2300.** OpenRouter returns `400 prompt: size must be between 0 and 2500`. CLI does not pre-validate. `[ ${#PROMPT} -lt 2300 ] && submit || echo TOO_LONG`.
5. **Voice consistency = a paste-identical voice-tag block in every kling prompt.** Same descriptor, same pitch, same pacing words. ~80-90% voice match without ElevenLabs. Without the block, kling drifts the speaker between clips.
6. **Music ban must be explicit AND repeated on every kling prompt.** `STRICTLY FORBIDDEN: NO music, NO instrumental, NO soundtrack, NO melody, NO singing, NO percussion.` Kling silently bakes a soft ambient bed if not forbidden. Music is a separate ElevenLabs pass overlaid in Remotion at `volume={0.18}`.
7. **If kling drifts to a wrong action interpretation twice, CHANGE THE SCENE — do not keep fighting the prompt.** Source-project example: nail-drumming-jar-near-cheek collapsed to "powder-compact stamping" twice with two different DO-NOT blocks. Cost: $2.24. Fix that worked: retire the action entirely, switch to jar-tilt-in-window-light at arms length.
8. **Carry visible internals (texture / charms / inclusions) into the FIRST-FRAME, not just the kling prompt.** Kling needs to see them on T0 or it won't add them mid-clip.

## Workflow (~$6-8 disciplined, ~$13 first-time)

1. **Research** (~$0.001). `ralphy ref pull <reference-url>` + `frames` + `transcribe` + `analyze-video` + `audio-describe` + `blueprint`. Identify the viral micro-mechanic (specificity bait? before-after texture? unboxing reveal?). Port the mechanic onto the new product on paper before any image gen.
2. **Storyboard on chat, no image gens** (~$0). Map the mechanic onto the new product. Write the 2-3 shot list with target seconds, cuts, spoken lines, SFX. Decide single-kling-call vs two-clips + splice. Get explicit user "go" BEFORE phase 3.
3. **Lock canonical refs** (~$0.35). Generate ONE product master (`openai/gpt-5.4-image-2`) + ONE persona master (`google/gemini-3-pro-image-preview` with user face selfie as `--ref`). User picks both. Save paths to `workspace/projects/<id>/locked-refs.md`. EVERY downstream gen passes BOTH as `--ref` from this point on.
4. **Scene first-frames** (~$0.45). For each kling clip, generate the first-frame image with `gemini-3-pro-image-preview` + both locked refs + scene description. If the scene shows product internals, describe them HERE in the first-frame. User OK on each first-frame before submitting kling.
5. **Kling video gens** (~$2.5-4). `ralphy generate video --model kwaivgi/kling-v3.0-pro --audio` per clip. Paste voice-tag block + music-ban block verbatim. Gate prompt length locally <2300. ONE try per clip. If kling drifts twice, change the scene (rule 7).
6. **ElevenLabs bg music** (~$0). `ralphy generate music` x 3 variants (lofi / sparkle-pop / acoustic), user picks one. `force_instrumental: true`, ~15-20s.
7. **Remotion compose + render** (~$0). Symlink `public/project-<id>` -> `workspace/projects/<id>/assets`. Write minimal per-project `src/videos/<id>/index.tsx` (~20 lines): `<Sequence>` per clip + one `<Audio volume={0.18}>` overlay. Register in `src/Root.tsx`. Write `composition-props.json` with `{"compositionId": "<CompId>"}` (required even prop-less). `ralphy render <id> --loudnorm`.

## Required inputs

| Slot | What it is | Example from source |
|---|---|---|
| `{{brand_name}}` | The brand wordmark on the product | "Fluttershy" |
| `{{product_name}}` | The product / sub-line name | "holographic glow cream" |
| `{{product_type}}` | Container archetype — jar / tube / bottle / compact / wand / palette | "squat transparent cosmetic jar" |
| `{{product_signature_detail}}` | The viral specificity hook (optional) — what the camera will pay off | "tiny floating charm-shape inclusions (butterfly, pony, star, heart, daisy) among holographic glitter" |
| `{{influencer_persona}}` | Persona description — face, hair, glasses, wardrobe, age register | "young woman, pastel pink floral pajama top, black round-frame glasses, freckles, light brown hair" |
| `{{location_master_plate}}` | Room dressing — single sentence describing the bedroom + light | "her own bedroom — unmade bed in soft focus, fairy lights along a bookshelf, warm afternoon window light from the right" |
| `{{target_language}}` | Spoken VO language. Drives kling `--audio` vs ElevenLabs post-hoc | "English" |
| `{{voice_tag_block}}` | Paste-identical voice descriptor block included in every kling prompt | see prompt-cookbook |

## Anti-patterns (DO NOT)

- **DO NOT** start scene gens before the user has locked both masters. The locks are mandatory inputs, not optional refinement.
- **DO NOT** put product within 30cm of face / cheek / mouth. Kling collapses to powder-compact stamping regardless of `DO NOT` instructions. Redesign the scene to keep product at arms length.
- **DO NOT** describe internals only in the kling prompt. Kling won't add them mid-clip. They MUST be in the first-frame.
- **DO NOT** skip the music-ban block in kling prompts. Kling will bake a soft ambient bed that fights the ElevenLabs overlay.
- **DO NOT** keep prompting against a drifted action interpretation past 2 tries. Change the scene.
- **DO NOT** use capital letters or underscores in slot ids. Lowercase kebab-case only (`scene-01-firstframe-charms`, not `Scene-01-A-firstframe`).
- **DO NOT** default to `--audio` on kling for Russian / non-English. Accent slips + voice-age drift. ElevenLabs `eleven_multilingual_v2` post-hoc per memory.
- **DO NOT** trust RMS / loudness readings as a silence proxy. Listen to the audio file. Intimate UGC selfie audio runs naturally quiet.
- **DO NOT** submit a kling prompt longer than 2300 chars. OpenRouter `400` after a round-trip.

## Beat structure (typical)

| Beat | Duration | Role |
|---|---|---|
| Hook | 0-3s | Selfie closeup, face top third, product at chin. First reaction line ("Wait... look at this."). Internals visible behind glass. |
| Discovery | 3-9s | Top-down macro or extreme macro. Unscrew / open / dip-and-lift. Named specificity callouts ("there is a butterfly... is that a tiny pony?"). |
| Payoff | 9-17s | Application + verdict. Cheek-dab + tilt-in-light. Calm content half-smile. Closing line ("Yeah... I am keeping this."). |

Total: 12-22s (sweet spot 17s — feels complete without scrolling-out). Two kling clips of 7-9s each, OR one single-call 12-15s clip if the shot sequence fits <2300 chars.
