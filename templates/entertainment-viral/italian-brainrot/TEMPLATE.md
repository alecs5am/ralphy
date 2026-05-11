# Italian Brainrot

Single-character AI-meme video with Italian-gibberish voiceover. **Not** the split-screen narration-over-gameplay format — that's [`brainrot-ai-meme`](../brainrot-ai-meme/TEMPLATE.md). Here the **character is the entire frame** (Tralalero Tralala, Tung Tung Tung Sahur, Ballerina Cappuccina, Chimpanzini Bananini, etc.) doing one absurd thing.

> **Sub-docs (read on demand):**
>
> | File | When to read it |
> |---|---|
> | [`hooks.md`](hooks.md) | Writing the 0-2s opening line — Italian-gibberish phrasing patterns |
> | [`prompt-cookbook.md`](prompt-cookbook.md) | Authoring image / video / VO prompts — camera vocabulary + worked examples |
> | [`characters.md`](characters.md) | Picking from the 33-character pool — names, slugs, what they look like |

## Format anatomy

| Slot | Length | Content |
|---|---|---|
| Hook | 0-2s | Character enters frame mid-action OR catchphrase opens cold. No wind-up. |
| Body | 2-15s | One absurd thing happening to / by the character. Mundane action × absurd creature. |
| Loop | 15-22s | Catchphrase repeats; characters often have a 3-word call-sign ("Tung tung tung sahur", "Tralalero tralala", "Capu capu cappuccino") |
| Payoff | 22-25s | Punchline / cut to black / cliffhanger — must invite the rewatch loop |

Target duration: **8-25s** (sweet spot ~15s). 9:16, 1080×1920, 30fps.

## Required inputs

1. **Character choice** — one of the 33 in [`characters.md`](characters.md), or propose adding a new one to the pool first.
2. **Scenario** — what mundane / absurd thing the character is doing (cooking, exercising, in a meeting, fighting, on a podcast, in court, at the dentist…).
3. **Optional setting** — kitchen, gym, courtroom, beach, space station. If omitted, art-director picks contextually.
4. **VO direction** — Italian gibberish read style: declarative monotone / sing-song / dramatic narrator / hushed conspiratorial.

## What makes it work

- **Visual identity must match the canonical character.** This is half the format — viewers recognize Tralalero Tralala specifically because of the three legs + Nike + blue shark combo. Pull the canonical hero image from the pool as image-to-image reference; **do not** improvise the look from descriptor alone.
- **Italian gibberish, not actual Italian.** Mix Italian-sounding phonemes with the character's call-sign. Don't try to translate real Italian sentences; the gibberish IS the meme.
- **Single character per video.** Crossover compositions exist but dilute the format — keep it 1 character per video unless explicitly doing a "vs" scene.
- **Mundane action × absurd creature** is the comedic engine. The funniest videos put the character in the most pedestrian context (waiting in line, doing taxes, on hold with customer service).

## Stack (defaults)

| Layer | Model | Notes |
|---|---|---|
| Hero image (reference) | `pool/italian-brainrot-characters/<slug>.jpg` | Pull via `ralphy assets pull-pool italian-brainrot-characters/<slug> --install <project>`. Use as image-to-image input. |
| Video shots | `kling-v3.0-pro` (OpenRouter) | 5-8s clips, image-to-video with the canonical hero as start frame. Cheaper alternative: `veo-3-fast`. Avoid generating without reference image — character drift kills the meme. |
| Voiceover | ElevenLabs `eleven_multilingual_v2` | Italian gibberish at stability ~0.4, style ~0.5. Voice picks: Adam, Antoni, Bill, or any high-energy male preset. |
| Music | OFF by default | Gibberish VO + ambient SFX carry. If music: ElevenLabs Music "chaotic / circus / militant march" bed at -22 dB. |
| Captions | Optional | Burn the gibberish phonetically with HormoziCaptions if you want the loop hook visible; otherwise leave audio-only. |

## Reference-required gate

User-reference NOT required — the canonical pool covers 33 characters. If the user wants a **new** character not in the pool:

1. Propose adding it to the pool first (`pool/italian-brainrot-characters/<new-slug>.jpg`) — find a canonical source image, attribute, commit to ralphy-assets.
2. Only proceed to scenario writing once the pool entry exists.
3. Refuse to generate "from scratch": the canonical visual identity is part of the joke; drift breaks the format.

## CLI cookbook

```bash
# scaffold a project from this template
ralphy template use italian-brainrot --project trip-troppi-cooking-001 \
  --brief "Trippi Troppi attempts a cooking tutorial, makes pasta carbonara, things escalate"

# pull the canonical character reference into the project
ralphy assets pull-pool italian-brainrot-characters/trippi-troppi \
  --install trip-troppi-cooking-001

# see the full character roster (33)
ralphy assets list --kind italian-brainrot-characters

# see all assets that work with this template
ralphy assets list --template italian-brainrot
```

## What to do next

1. Pick character → write scenario (`/ralph-scenarist` reads this + `characters.md`).
2. Pull canonical reference → art-director generates image-to-video shots.
3. ElevenLabs gibberish VO (one call, ~15s).
4. Optional: phonetic captions burned in.
5. Render via Remotion (single composition, hero shot + optional caption layer).

Cost target: **<$0.50 per video** at default stack (1× hero image already pulled, 2× 5s kling clips, 1× ElevenLabs VO).
