# Prompt cookbook — Broadcast Caught-On-TV (Square)

Two-stage chain. Stage 1: square broadcast-capture still on `openai/gpt-5.4-image-2` with the user's selfie as `--ref`. Stage 2: 15s i2v on `kwaivgi/kling-v3.0-pro` with `--audio` and the still as `--first-frame`.

All `{{slots}}` are project-specific. Aesthetic descriptors (square, broadcast-capture, SPOTV-style soft compression, flyaway hairs, no beauty filter) are the template's DNA — keep literal.

## Slot map

| Slot | Description | Example (kbo-broadcast-001) |
|---|---|---|
| `{{league_or_sport}}` | Live event the broadcast is from | `Korean KBO baseball` |
| `{{moment_archetype}}` | The caught-on-TV moment | `audience-cam reaction` |
| `{{broadcast_channel}}` | Real network whose graphics package to imitate | `SPOTV / KBO live broadcast` |
| `{{target_language_for_announcer}}` | Drives Kling's ambient announcer voice | `Korean` |
| `{{venue_dressing}}` | Stadium / venue context | `blue stadium seats, beer cups, small portable fan, other spectators` |
| `{{subject_pose}}` | How the subject is posed in the still | `seated in the audience, casually watching the game` |

---

## Stage 1 — Square broadcast-capture still

**Model:** `openai/gpt-5.4-image-2`
**Cost:** ~$0.20 / image
**Refs:** `--ref <user-selfie>` (one ref is enough — do NOT add a second)
**Size:** OMIT `--size` (let gpt-5.4 produce its natural 1024² square — this is the desired aesthetic)
**Aspect:** OMIT `--aspect-ratio` — square is load-bearing
**Slot suggestion:** `scene-01-still-square`

### Prompt template

```
Keep the face and identity of the person from the uploaded photo exactly the same.
Make sure it looks like the same person by preserving the face shape, eyes, nose,
lips, skin tone, hair color, hairline, and overall facial impression and vibe.
Important: Do not beautify the person into an AI handsome/beautiful model. Do not
make it look like a fashion editorial, influencer photo, or advertisement.

Generate the image as if this person were a real ordinary spectator accidentally
caught by a live {{league_or_sport}} broadcast camera. The result should feel
natural, realistic, and grounded in reality. Use the look of a {{broadcast_channel}}
screen capture. The person should appear {{subject_pose}}. Show a relaxed pose,
sitting comfortably with legs crossed or in a natural seated posture. The facial
expression should feel natural, as if they are only half-aware of the camera.

The surroundings should include {{venue_dressing}}, and a believable
{{league_or_sport}} game / event atmosphere. The background should clearly look
like a real venue audience section.

Important: no over-retouched face, no enlarged eyes, no jawline reshaping, no
smoothed beauty filter skin, no heavy makeup look. It should feel like a real TV
broadcast image: slightly soft live-broadcast quality, light compression noise,
subtle motion blur, realistic skin texture, flyaway hairs, and a slight natural
sweat sheen. The final result should feel natural, realistic,
ordinary-but-attractive, and look like a real broadcast capture.
```

### Why each clause matters

| Clause | Load-bearing role |
|---|---|
| `Keep the face and identity ... exactly the same` (one block, not repeated) | Tells gpt-5.4 to lean on the `--ref` for identity. Don't restate identity language outside this block — gemini-3-pro penalizes it. |
| `Do not beautify ... AI handsome/beautiful model` | Negates the most common AI-slop failure mode for face generation. |
| `slightly soft live-broadcast quality, light compression noise, subtle motion blur` | The single most important aesthetic clause. Without it, gpt-5.4 produces a glossy editorial portrait. |
| `flyaway hairs, slight natural sweat sheen` | Anti-AI-slop micro-detail tokens. Both consistently appear in real broadcast caps. |
| `no over-retouched face, no enlarged eyes, no jawline reshaping, no smoothed beauty filter skin, no heavy makeup look` | Negative prompt against beauty-filter drift. |
| `{{broadcast_channel}} screen capture` | The single token that triggers on-screen-graphics aesthetic. Use a real channel name. |

### Alternate: strict 9:16 from origin (rarely needed)

If platform-strict 9:16 is hard-required at origin, switch to `google/gemini-3-pro-image-preview`. Shorter prompt is better for gemini — drop the identity-preservation block (the `--ref` carries it), describe the scene only:

```
Vertical 9:16 portrait frame, TikTok format. The person from the reference image
{{subject_pose}} at a {{league_or_sport}} venue, casually watching the event.
Live {{broadcast_channel}} capture style. {{venue_dressing}}. Candid TV broadcast
feel.
```

Gemini-3-pro returns transient skeleton-null responses (`content:null, refusal:null`) — retry up to 5× before falling back to gpt-5.4. Cost ~$0.15 / success.

---

## Stage 2 — 15s Kling i2v with ambient audio

**Model:** `kwaivgi/kling-v3.0-pro`
**Cost:** ~$0.14/sec → $2.10 for 15s
**Refs:** `--first-frame <stage-1-still>.png` (no second ref)
**Audio:** `--audio` (YES — ignore the CLI help text saying "Veo 3 only"; Kling produces clean diegetic ambient for non-speech audio)
**Aspect:** `--aspect-ratio 9:16` is fine to pass — Kling will honor the square first-frame anyway and output 960x960
**Slot suggestion:** `scene-01-vid` (new slot per duration / audio combo)

### Prompt template

```
Vertical 9:16 TikTok format throughout — portrait orientation, never landscape.
Use the uploaded image as the identity anchor; the same {{subject_pronoun}} stays
fully recognizable in every frame. 15-second realistic {{moment_archetype}} clip,
as if caught on a live {{broadcast_channel}} broadcast.

Beat-by-beat motion:
- 0-3s {{subject_pronoun}} watches the {{league_or_sport}} event, blinks, slight
  head tilt, soft natural smile.
- 3-6s {{subject_pronoun}} notices the camera, brief eye contact, small amused
  reaction.
- 6-9s {{subject_pronoun}} looks away, takes a sip from a paper beer cup, glances
  back at the field.
- 9-12s {{subject_pronoun}} laughs lightly at the game, claps once or twice softly
  with the crowd.
- 12-15s {{subject_pronoun}} settles back, exhales, returns to watching, slight
  posture adjustment.

Subtle hair movement, faint sweat sheen, realistic skin texture. Live TV capture
feel: slight broadcast camera shake, soft slow zoom-in, light compression
artifacts, natural crowd motion behind {{subject_pronoun}}, realistic stadium
lighting.

Ambient diegetic audio: live {{league_or_sport}} venue ambience — crowd chatter
and cheering, distant {{event_sfx_signature}}, occasional {{venue_audio_signature}},
{{target_language_for_announcer}} {{broadcast_channel}} announcer voice in the
background, vendor calls, no music, no studio voiceover.

No glamour, no fashion-shoot vibe, no influencer aesthetic, no identity change,
no face distortion.
```

### Slot quick-fill for sports

| `{{league_or_sport}}` | `{{event_sfx_signature}}` | `{{venue_audio_signature}}` |
|---|---|---|
| KBO baseball | bat crack | thunder-stick claps and chant |
| NFL | helmet collision / ref whistle | crowd roar wave |
| NBA | sneaker squeak / ref whistle | half-time horn |
| Wimbledon | ball-on-strings + chair umpire | polite applause |
| Premier League | ref whistle | chant from the away end |
| Eurovision audience | flag-rustle | language-mixed cheering |

### Pronoun pass — DO NOT skip

Before submitting, scan the prompt for every `she / her / hers / he / him / his`. Swap `{{subject_pronoun}}` to match the actual subject. Kling honors prompt pronouns even with a male / female `--first-frame`, leading to subtle feature drift.

### Why each clause matters

| Clause | Load-bearing role |
|---|---|
| `Vertical 9:16 TikTok format throughout` at the top | Doesn't actually force aspect (Kling honors the square first-frame) but anchors framing language. Safe to leave in. |
| `Beat-by-beat motion: 0-3s ... 3-6s ...` | Prevents motion compression into the first 5s. Without explicit windows, Kling treats 15s as "5s of action + 10s hold". |
| `slight broadcast camera shake, soft slow zoom-in, light compression artifacts` | The three tokens that sell "real broadcast capture" on the i2v stage. |
| `{{target_language_for_announcer}} {{broadcast_channel}} announcer voice in the background` | Triggers Kling's ambient announcer synthesis. Use the venue's actual language. |
| `no music, no studio voiceover` | Required negation — Kling will add a soundtrack if you don't ban it. |
| `No glamour, no fashion-shoot vibe, no influencer aesthetic, no identity change, no face distortion` | The final-line guardrail against AI-slop drift on i2v. |

---

## Anti-patterns inside the prompt body

- **DO NOT** repeat "exact same identity, same face shape, same eyes" outside the single identity-preservation block. Pushes gemini into skeleton-null responses; doesn't help gpt-5.4 either.
- **DO NOT** name a real public figure for the subject. The reference is the user's own selfie; the joke depends on it being the poster, not a celebrity.
- **DO NOT** add `--ref <selfie>` to the Kling video call. The still is already the anchor; multi-ref dilutes Kling's identity hold.
- **DO NOT** ask for "cinematic broadcast" or "film grain broadcast". Both pull the model toward 16:9 letterbox-cinematic register, which kills the on-phone-feed feel.
