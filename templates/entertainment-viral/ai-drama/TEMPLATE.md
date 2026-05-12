# AI Drama — vibe reference

**Genre:** Pixar-3D mini-soap-opera between anthropomorphic fruits / objects / animals with on-camera character dialogue.
**Length:** 48-64s (default 56s = 7 scenes × 8s).
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.
**Inspired by:** [@fruittalesco](https://www.tiktok.com/@fruittalesco) and the broader 2026 "AI fruit drama" wave.

> This template is a **vibe anchor**, not a fill-in-the-blank. `/ralph-scenarist` writes a fresh scenario every project from this file + `reference-example.md` as vibe sources.

## Why this format works

A 2026 viral pattern that fused Pixar-Disney production gloss with TikTok's appetite for parasocial micro-drama:

1. **Visual hook from frame 1.** A cartoon banana wearing an office shirt and tie is already a meme before the dialogue starts. The brain pauses to process the absurdity.
2. **Universal soap-opera beats.** Affairs, breakups, found-family, glow-ups — the plots are translatable across every culture. No setup needed.
3. **On-camera dialogue beats voiceover.** The characters speak directly with visible lip-sync. Off-screen narrator kills the format — it turns it back into "an AI explainer with cute graphics" instead of a drama.
4. **Veo native audio is the unlock.** Veo 3.1 with `--audio` generates lip-synced English speech that's actually convincing. No external TTS, no audio-video sync drift. One model does dialogue + visuals end-to-end.
5. **Single-word popup captions amplify.** The TheBoldFont popwords style reinforces emotional peaks ("TONIGHT", "PIT", "AWAY") and works as a second readability layer when audio is off (TikTok default).

## Vibe anchors (load-bearing)

- **Pixar-3D cast, not photoreal, not flat-cartoon.** Smooth glossy textures, big expressive eyes, soft cinematic lighting. Think Pixar shorts / Inside Out short scenes, not Saturday-morning TV.
- **Real-world settings.** Kitchens, offices, parks, suburban front yards. The mundane setting carries the soap-opera tone.
- **Humanoid clothing on a fruit/object head.** White office shirt + tie on a banana, pencil skirt + blazer on a cherry. The fruit/object IS the head; the body is normal-proportioned with realistic clothing. NO whole-body fruit (that's `ai-vegetables`).
- **Dialogue on camera with visible lip movement.** Every line must be spoken by a character whose mouth moves on screen. Off-screen narration is forbidden — it's the format-killer.
- **Soap-opera-serious tone.** Play the drama straight, not winking. The format is funny because the characters take themselves seriously, not because they perform comedy.

## Plot trope library

The viral wave keeps recycling a small set of templates. Pick one and swap the cast:

| Trope | Beats | Reference |
|---|---|---|
| **The Affair** | happy-family → temptation → caught → confrontation → walk-out → rebound | fruit-drama-001 (default) |
| **The Breakup** | cute-couple → fight → silent-treatment → tearful goodbye → glow-up | — |
| **Found Family** | lonely-orphan → bumps-into-mom → invited-home → meal-together → adopted | original fruittalesco "выхожу на какое-то время" |
| **Love Triangle** | established-couple → new-arrival → tension → choice → fallout | — |
| **Parent-Child** | helicopter-parent → teen-rebellion → big-fight → reconciliation | — |
| **Glow-up Revenge** | bullied-protagonist → time-jump → success → bullies-stunned | — |
| **Mistaken Identity** | wrong-person picks up wrong-cup/file/baby → escalating chaos → reveal | — |

## Variation axes (what changes between videos)

| Axis | Options |
|---|---|
| Cast type | fruits (banana, strawberry, cherry, carrot, kiwi, orange), vegetables (tomato, broccoli), objects (lamp, fridge, kettle), animals (kitten, duckling), food items (donut, cupcake, sandwich) |
| Cast count | 3-4 main characters (default 4 — protagonist + partner + antagonist + rebound) |
| Plot | from the table above |
| Setting palette | suburban-warm, corporate-cold, park-golden, dimly-lit-drama, school-fluorescent |
| Tone | melodrama played straight (default), deadpan-comedy, soap-opera serious |
| VO language | English (clean, validated — Veo native EN), Chinese (also clean), Russian (works but accent risk warned in MODELS.md) |

## Narrative arc (shape, not prescription)

```
Scene 1 (0-8s)     → HOOK + ESTABLISHED-WORLD. Show the protagonist + partner happy. First line of dialogue establishes the relationship.
Scene 2 (8-16s)    → INCITING-INCIDENT. Antagonist appears. Tension introduced.
Scene 3 (16-24s)   → RISING-ACTION. The transgression / temptation / mistake happens.
Scene 4 (24-32s)   → DISCOVERY. Partner notices the evidence.
Scene 5 (32-40s)   → CONFRONTATION. Direct character-to-character collision. Peak emotional beat.
Scene 6 (40-48s)   → CONSEQUENCE. Departure, slam-out, public unraveling.
Scene 7 (48-56s)   → RESOLUTION. New status quo — found-family, glow-up, lonely-tear, or rebound.
```

The arc is **load-bearing** — skipping the discovery beat (sc-4) or the confrontation beat (sc-5) breaks the soap-opera feel.

## Required user inputs (minimum to launch)

1. **Cast spec** — what are the characters (e.g. "father=banana, mother=strawberry, boss=cherry, rebound=carrot"). The scenarist will write lock-strings.
2. **Plot trope** — pick from the trope library above or describe a custom one in 1-2 lines.
3. **VO language** — default English. Veo native audio is cleanest in EN; flag the user explicitly if they ask for RU (per MODELS.md warning).
4. **Tone** — default melodrama-played-straight. The scenarist defaults here unless told otherwise.

Everything else (settings, dialogue lines, beat-by-beat camera direction) derives from these inputs through `/ralph-scenarist`.

## When NOT to use

- **Brand promo with required logo placement.** A talking banana can't carry a logo naturally.
- **Real-person likeness.** Refuse and escalate to AGENTS.md hard rule #3.
- **Multi-language ensemble.** Veo native audio doesn't dub; pick one language per project.
- **Format requires real-world cinematography.** This is a stylized 3D Pixar look — switch to `cinematic` or `talking-head-rant` if photoreal is required.
- **Sub-30s pacing.** The seven-beat arc needs 48s minimum. Tighter? Drop to a single character monolog format (`talking-head-rant`).

## Cost ballpark per video (56s default)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 7 × `gemini-3-pro-image-preview` @ $0.15 | $1.05 |
| Video clips | 7 × `google/veo-3.1` × 8s @ $0.50/sec | $28.00 |
| Voiceover | NONE (Veo native) | $0 |
| Music | NONE (Veo native ambient is the bed) | $0 |
| Captions | ElevenLabs Scribe v1 on 56s audio | ~$0.004 |
| Render | local | $0 |
| **Total** | | **~$29** |

Premium tier — `veo-3.1` is the load-bearing model and is ~3× the cost of `veo-3.1-fast`. If the user needs cheaper, swap to `veo-3.1-fast` ($0.14/sec → ~$8 total) but quality of facial micro-expressions drops noticeably.

## The one rule the model-stack file beats you over the head with

> **Do not generate music separately. Veo already does it.**

Veo 3.1 with `--audio` injects scene-appropriate ambient/score under every clip. If you also call `ralphy generate music` and mix the ElevenLabs bed on top, you get **two music layers stacked on top of each other** — one Veo, one ElevenLabs, both ducked under the same dialogue, audible in every pause between lines. Mud.

The fix is structural, not "louder voice, quieter music":

1. **Every Veo prompt MUST include the no-music anti-instruction** (see `fragments.md → No-music clause`). This nudges Veo toward "minimal natural room tone" instead of "swelling orchestral score."
2. **The pipeline MUST NOT call `ralphy generate music`** for this template. The Veo native audio IS the score. Period.
3. **Cost benefit:** also why this template's $29 number has no music line item.

## Read also

- `fragments.md` — character lock-strings, scene fragments, the no-music clause, plot beat templates.
- `model-stack.md` — order of operations, the literal Veo prompt template that bakes in the no-music rule.
- `composition.md` — Remotion skeleton with PopWordCaptions + how to NOT add a music track.
- `reference-example.md` — the canonical fruit-drama-001 reference (Banana × Strawberry × Cherry × Carrot affair plot, 56s English).
