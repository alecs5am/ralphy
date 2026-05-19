# Worked examples — Broadcast Caught-On-TV (Square)

Two complete variant fills, end-to-end. Each shows the slot substitutions and the resulting Stage-1 + Stage-2 prompts. Copy-paste, swap slots for your project, run.

---

## Example A — KBO baseball audience-cam (the canonical source)

This is the source-project fill. Use as the smoke-test target when validating the template.

**Slot fills:**

| Slot | Value |
|---|---|
| `{{league_or_sport}}` | `Korean KBO baseball` |
| `{{moment_archetype}}` | `audience-cam reaction beat` |
| `{{broadcast_channel}}` | `SPOTV / KBO live broadcast` |
| `{{target_language_for_announcer}}` | `Korean` |
| `{{venue_dressing}}` | `blue stadium seats, beer cups, small portable fan, other spectators, cheering items` |
| `{{subject_pose}}` | `seated in the stadium audience, casually watching the game` |
| `{{event_sfx_signature}}` | `bat crack` |
| `{{venue_audio_signature}}` | `thunder-stick claps and chant` |
| `{{subject_pronoun}}` | `he` (subject is male) |

**Stage 1 — `openai/gpt-5.4-image-2`, square 1024², ~$0.20:**

> Keep the face and identity of the person from the uploaded photo exactly the same. Make sure it looks like the same person by preserving the face shape, eyes, nose, lips, skin tone, hair color, hairline, and overall facial impression and vibe. Important: Do not beautify the person into an AI handsome/beautiful model. Do not make it look like a fashion editorial, influencer photo, or advertisement. Generate the image as if this person were a real ordinary spectator accidentally caught by a live Korean KBO baseball broadcast camera. The result should feel natural, realistic, and grounded in reality. Use the look of a SPOTV / KBO live broadcast screen capture. The person should appear seated in the stadium audience, casually watching the game. Show a relaxed pose, sitting comfortably with legs crossed or in a natural seated posture. The facial expression should feel natural, as if they are only half-aware of the camera. The surroundings should include blue stadium seats, beer cups, small portable fan, other spectators, cheering items, and a believable Korean KBO baseball game atmosphere. The background should clearly look like a real venue audience section. Important: no over-retouched face, no enlarged eyes, no jawline reshaping, no smoothed beauty filter skin, no heavy makeup look. It should feel like a real TV broadcast image: slightly soft live-broadcast quality, light compression noise, subtle motion blur, realistic skin texture, flyaway hairs, and a slight natural sweat sheen.

**Stage 2 — `kwaivgi/kling-v3.0-pro --duration 15 --audio`, ~$2.10:**

> Vertical 9:16 TikTok format throughout — portrait orientation, never landscape. Use the uploaded image as the identity anchor; the same man stays fully recognizable in every frame. 15-second realistic audience-cam reaction beat clip, as if caught on a live SPOTV / KBO live broadcast. Beat-by-beat motion: 0-3s he watches the Korean KBO baseball event, blinks, slight head tilt, soft natural smile. 3-6s he notices the camera, brief eye contact, small amused reaction. 6-9s he looks away, takes a sip from a paper beer cup, glances back at the field. 9-12s he laughs lightly at the game, claps once or twice softly with the crowd. 12-15s he settles back, exhales, returns to watching, slight posture adjustment. Subtle hair movement, faint sweat sheen, realistic skin texture. Live TV capture feel: slight broadcast camera shake, soft slow zoom-in, light compression artifacts, natural crowd motion behind him, realistic stadium lighting. Ambient diegetic audio: live Korean KBO baseball venue ambience — crowd chatter and cheering, distant bat crack, occasional thunder-stick claps and chant, Korean SPOTV announcer voice in the background, vendor calls, no music, no studio voiceover. No glamour, no fashion-shoot vibe, no influencer aesthetic, no identity change, no face distortion.

**Expected output:** 960×960 square mp4, 15s, native ambient stadium audio with Korean announcer. Subject recognizable across all 5 beat windows. See `assets/example-broadcast-clip-square.mp4`.

---

## Example B — Wimbledon centre-court audience cutaway

A different sport, different venue language, different audio signature. Demonstrates how the template generalizes.

**Slot fills:**

| Slot | Value |
|---|---|
| `{{league_or_sport}}` | `Wimbledon tennis` |
| `{{moment_archetype}}` | `centre-court audience cutaway` |
| `{{broadcast_channel}}` | `BBC Sport / Wimbledon live broadcast` |
| `{{target_language_for_announcer}}` | `English (British)` |
| `{{venue_dressing}}` | `dark green wooden show-court seats, Pimm's cups, straw hats, AELTC purple-and-green programmes, other spectators` |
| `{{subject_pose}}` | `seated in the audience, attentively watching a baseline rally` |
| `{{event_sfx_signature}}` | `ball-on-strings + chair umpire calling the score` |
| `{{venue_audio_signature}}` | `polite-applause-then-silence` |
| `{{subject_pronoun}}` | `she` (subject is female) |

**Stage 1 — `openai/gpt-5.4-image-2`, square 1024², ~$0.20:**

> Keep the face and identity of the person from the uploaded photo exactly the same. Make sure it looks like the same person by preserving the face shape, eyes, nose, lips, skin tone, hair color, hairline, and overall facial impression and vibe. Important: Do not beautify the person into an AI handsome/beautiful model. Do not make it look like a fashion editorial, influencer photo, or advertisement. Generate the image as if this person were a real ordinary spectator accidentally caught by a live Wimbledon tennis broadcast camera. The result should feel natural, realistic, and grounded in reality. Use the look of a BBC Sport / Wimbledon live broadcast screen capture. The person should appear seated in the audience, attentively watching a baseline rally. Show a relaxed pose, sitting comfortably with legs crossed or in a natural seated posture. The facial expression should feel natural, as if they are only half-aware of the camera. The surroundings should include dark green wooden show-court seats, Pimm's cups, straw hats, AELTC purple-and-green programmes, other spectators, and a believable Wimbledon tennis game atmosphere. The background should clearly look like a real venue audience section. Important: no over-retouched face, no enlarged eyes, no jawline reshaping, no smoothed beauty filter skin, no heavy makeup look. It should feel like a real TV broadcast image: slightly soft live-broadcast quality, light compression noise, subtle motion blur, realistic skin texture, flyaway hairs, and a slight natural sweat sheen.

**Stage 2 — `kwaivgi/kling-v3.0-pro --duration 15 --audio`, ~$2.10:**

> Vertical 9:16 TikTok format throughout — portrait orientation, never landscape. Use the uploaded image as the identity anchor; the same woman stays fully recognizable in every frame. 15-second realistic centre-court audience cutaway clip, as if caught on a live BBC Sport / Wimbledon live broadcast. Beat-by-beat motion: 0-3s she watches the Wimbledon tennis baseline rally, head tracks the ball side-to-side, slight lean forward at a long rally. 3-6s she notices the camera, brief eye contact, polite small smile and tiny head-tilt. 6-9s she looks back toward the court, takes a slow sip from her Pimm's cup, glances at the scoreboard. 9-12s she joins polite applause at the end of a point, controlled small clap with the crowd. 12-15s she settles back, exhales, returns to watching, slight posture adjustment. Subtle hair movement, faint sweat sheen, realistic skin texture. Live TV capture feel: slight broadcast camera shake, soft slow zoom-in, light compression artifacts, natural crowd motion behind her, realistic show-court daylight. Ambient diegetic audio: live Wimbledon tennis venue ambience — crowd chatter and cheering, distant ball-on-strings + chair umpire calling the score, occasional polite-applause-then-silence, English (British) BBC Sport / Wimbledon live broadcast announcer voice in the background, no music, no studio voiceover. No glamour, no fashion-shoot vibe, no influencer aesthetic, no identity change, no face distortion.

**Expected output:** Same 960×960 square geometry, but the venue + audio signature reads as Wimbledon, not KBO. Note that the female-pronoun swap is in place (`she` instead of `he`) — the subject is female.

---

## Pattern notes from these examples

- The Stage-1 prompt is structurally identical between examples — only slot fills change. The aesthetic clauses (`slightly soft live-broadcast quality, light compression noise, subtle motion blur, flyaway hairs, slight natural sweat sheen`) stay verbatim every time.
- The Stage-2 prompt's `event_sfx_signature` and `venue_audio_signature` are the two highest-leverage slot fills for venue believability. Get these specific to the sport — generic "crowd noise" reads thin.
- The pronoun swap is the single most common slot mistake. Always scan the prompt for `he/him/his` vs `she/her/hers` once after fill, before submitting.
