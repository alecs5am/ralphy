# Prompt cookbook — pov-first-person

Recipes for `/ralph-art-director`. Combine fresh per project; don't paste verbatim. The structure is the template, the prompt content is per-project.

## Master template

The whole format is three beats glued together. Each beat is one prompt-pair (keyframe + i2v) at most.

```
[BEAT 1 — POV text hook + character intro frame]
Selfie-style / face-cam framing of <persona>, <environment>, <neutral pre-reaction beat>.
Eye contact with the camera. Soft natural light. Slight handheld feel.
Centered text overlay: "POV: <scenario line>" — large, white, persistent.

[BEAT 2 — scene develops, reactive expressions]
Same character, same framing, <environment unchanged>.
Reactive expression: <eyebrow raise / slow blink / breath in / head-tilt / tight smile>.
Optional: <prop in hand / glance off-camera / under-the-breath line>.
The POV text either persists for the full beat or fades after the 2s mark.

[BEAT 3 — payoff]
Same character. <Punchline delivery / emotional peak / cut-to-black moment>.
Camera holds for one extra beat after the line lands.
```

For single-shot videos (8-12s), beats 2 and 3 are one continuous animation prompt — describe the emotional arc inside one i2v call.

## Character animation prompt vocabulary

Talking-character animation in Kling / Veo lives or dies on the verb choice. Generic verbs ("the character speaks") collapse into rubber-mouth lipsync. Use micro-action verbs.

### In-character expression
- "Holds eye contact with the camera, deadpan."
- "Slight tight smile, then it falls."
- "Eyes widen slowly as realization lands."
- "Closes eyes briefly, breathes in, opens them."
- "Glances off-camera, then back, jaw set."
- "Half-laugh that doesn't reach the eyes."

### Micro-reactions (the back half of beat 2)
- "Eyebrow raises ~1cm, holds for half a second."
- "Slow blink, no other facial movement."
- "Inhales sharply through the nose."
- "Head tilts 5-10 degrees to the side."
- "Lips press together, no smile."
- "Single nod, then stillness."

### Eyes-to-camera
- "Eye contact never breaks across the clip."
- "Eyes track from off-camera left to direct camera."
- "Brief glance away to the right, then back."

### What to avoid in animation prompts
- "Speaks the line" — too generic, will produce bad lipsync. Either describe the mouth motion specifically ("opens mouth to speak the line, voice not heard yet") or skip lipsync entirely and let VO + captions carry the line.
- "Acts <emotion>" — name the body movement, not the emotion. "Looks tired" → "shoulders slump 2cm, eyes lower halfway."
- "Reacts" — name the reaction. "Reacts in shock" → "eyes widen, breath catches, no other movement."

### Lipsync decision

Three options, in increasing risk:

1. **No lipsync.** POV text overlay + reactive expressions only. VO is added in post (or skipped). Safest. Most POV videos work this way.
2. **Off-camera VO.** Character reacts to the POV scenario, voice plays over their reaction. No mouth motion required. Low risk.
3. **On-camera lipsync.** Character speaks the payoff line on camera. Highest risk — Kling / Veo lipsync is often visibly off. Only use if the line is short (≤ 6 words) and the brief explicitly asks for it.

Default to option 1. Recommend option 3 only when the payoff is dialogue-led and the user accepts the AI-lipsync risk.

## Audio direction

POV format leans on platform sound culture more than original score. Three options:

### Trending sound (preferred when available)
> If the brief cites a specific TikTok / Reels sound, use it. The researcher playbook can pull it via yt-dlp + ffmpeg. Do not regenerate music when a trending sound is the cultural anchor — that's the whole point of the format on the platform.

### Original emotional bed (ElevenLabs Music)
> When no trending sound is named, generate a single emotional bed:
> - **Comedy / B2B punchline:** "Quirky deadpan instrumental, light percussion, slight off-kilter melody, 80-90 BPM, no vocals." Cut hard at the punchline.
> - **Dating / lifestyle / wistful:** "Soft indie instrumental, acoustic guitar + piano, 70-80 BPM, gently melancholic, no vocals."
> - **Panic / dread:** "Tense ambient, low strings, slow building, 60 BPM, anxious undertone, no vocals."

### No music (often correct)
> Voice + ambient room tone is sometimes the right call — especially for deadpan comedy where music would over-direct the joke. When in doubt, A/B with and without.

### VO settings (ElevenLabs)

Match the tone:
- **Deadpan / fed-up:** stability 0.65, style 0.15. Flat, controlled.
- **Panicked / overwhelmed:** stability 0.40, style 0.40. Variable, emotional.
- **Wistful / sincere:** stability 0.55, style 0.30. Soft, present.
- **Dark-humor punchline:** stability 0.70, style 0.10. Almost too still.

If ElevenLabs delivers a too-confident tone for a panicked beat, regen with lower stability.

## Captions

The POV text line is **NOT** a caption — it's a separate static overlay, large, centered, persistent for the hook beat. Render it via `<AbsoluteFill>` + a custom text component in Remotion. Don't pass it through whisper-1.

The VO line(s) inside the scene ARE captions. Two style options:

- **HormoziCaptions** — comedy, B2B, panic / dread tones. Large pop, white + black outline. Word-level reveal.
- **MinimalCaptions / TikTok-white-stroke** — lifestyle, dating, wistful / sincere tones. Smaller, lower-third, white with thin stroke.

If the payoff line is the only spoken line in the whole video, render it as captions even if the rest is silent.

## Single-shot vs multi-cut decision

| Factor | Single-shot | Multi-cut |
|---|---|---|
| Duration | 8-12s | 12-25s |
| Clip count | 1 | 2-3 |
| Cost | $0.70-$1.10 | $1.40-$3.40 |
| Risk | low (one bad clip = total redo) | medium (any bad clip needs regen) |
| Best for | comedy, deadpan, B2B punchline | emotional payoff, narrative arc, complex scenarios |
| Worst for | scenarios with a hard scene change in the payoff | tight comedy timing |

**Default to single-shot.** Multi-cut only when the payoff genuinely requires a cutaway (e.g., "POV: you sent the wrong text" → cutaway to phone screen for the payoff).

## Common mistakes (8)

1. **POV text too long.** > 12 words doesn't fit on screen at the required size, and viewer can't read it in 2s. Trim ruthlessly.
2. **POV text fades too early.** It's the whole hook. Hold ≥ 2s. Don't animate it out before the viewer has finished reading.
3. **Character not reacting.** A blank-faced character is a dead video. The reaction IS the back half. If you can't describe a specific micro-reaction, the scenario isn't sharp enough — go back to the scenarist.
4. **No payoff.** The video ends with the character still reacting. That's a hook, not a video. Always land on punchline / emotional peak / cliffhanger.
5. **Generic scenario.** "POV: you're stressed" — no recognition, no share. Specificity is the only currency POV format trades in.
6. **Too obvious AI lipsync.** If the payoff is on-camera dialogue and the lipsync is off by 2+ frames, the video reads as fake and the share-rate dies. Default to no-lipsync (VO over reactive face) unless the brief insists.
7. **Music over-directing the joke.** Loud music + deadpan POV = the music tells the viewer how to feel, which kills the deadpan. Lower the music or drop it entirely.
8. **Multiple POV lines in one video.** Never. The format is one scenario, one reaction, one payoff. If you have two scenarios, that's two videos — `batch-from-template` it.

## Worked examples

### Example A — Comedy POV (you're the awkward one)

**Brief.** Comedy, deadpan, single-shot. Niche: friend-group dynamics.

**POV line.** `POV: you're the only one in the group chat who actually replies.`

**Persona.** Mid-twenties, deadpan, slightly tired-eyed. Bedroom or kitchen, soft natural light.

**Beat 1 (0-2s, keyframe + 2s i2v).**
> Selfie-style face-cam of a mid-twenties person, deadpan expression, slight under-eye fatigue, sitting on the edge of a bed with phone in hand. Soft afternoon natural light. Eyes to camera. Centered text overlay: `POV: you're the only one in the group chat who actually replies.`

**Beat 2+3 combined (2-10s, single i2v).**
> Same character, same framing. Glances down at phone, scrolls thumb up once, looks back up at camera. Slow blink. Tight half-smile that doesn't reach the eyes. Holds eye contact for 2 extra seconds. No spoken line.

**VO / captions.** None. Trending deadpan-comedy sound or no audio.

**Payoff style.** Deadpan-hold cliffhanger. The held eye contact IS the punchline.

---

### Example B — Dating POV (third date)

**Brief.** Dating, panic-pivot, single-shot.

**POV line.** `POV: third date and they just said "I don't really do labels."`

**Persona.** Late twenties, expressive, sitting at a restaurant table.

**Beat 1 (0-2s).**
> Selfie-style or POV-across-the-table framing. Late-twenties character at a restaurant table, glass of wine half-raised, mid-sip. Warm low light. Eyes go to camera (i.e., the date). Centered text overlay: `POV: third date and they just said "I don't really do labels."`

**Beat 2 (2-7s).**
> Same character, same framing. Glass lowers slowly, eyes don't break contact. Faintest smile. Inhales through the nose. Tilts head 5 degrees.

**Beat 3 (7-12s, payoff).**
> Same character. Quiet line, half-spoken on-camera: "Cool. Cool cool cool." Eyes never break contact. One slow blink at the end.

**VO.** ElevenLabs, stability 0.65, style 0.15 — deadpan delivery of "cool cool cool."

**Captions.** HormoziCaptions on the spoken line, word-level.

**Payoff style.** Punchline. Deadpan-hold after.

---

### Example C — B2B POV (only marketer at a startup)

**Brief.** B2B-SaaS, fed-up tone, multi-cut (2 shots).

**POV line.** `POV: you're the only marketer at a startup and the founder just said "let's go viral by Friday."`

**Persona.** Late twenties to mid-thirties, hoodie, in front of a laptop, open-plan office or home office.

**Beat 1 (0-3s, keyframe + i2v).**
> Eye-level face-cam of a late-twenties marketer in a hoodie, sitting at a laptop. Slack open on screen, blurred. Late-afternoon light through a window. Neutral expression, then eyes flick up to camera. Centered text overlay: `POV: you're the only marketer at a startup and the founder just said "let's go viral by Friday."`

**Beat 2 (3-10s, second i2v shot).**
> Same character, same framing, slight zoom in. Slow inhale, tight closed-mouth smile, eyes go slightly glassy. Single nod. Looks down at the laptop, types one keystroke, looks back up. Holds.

**Beat 3 (10-15s, third i2v shot — cutaway).**
> Cutaway to the laptop screen: a Google Doc titled "Viral Campaign Plan — Friday" with one bullet that reads "step 1: panic." Hand visible at edge of frame. Holds for 2 seconds.

**VO.** None — text overlay + cutaway-doc text carry it.

**Captions.** No captions on beat 1 or 2. The doc text on beat 3 is in-frame text, not a caption.

**Payoff style.** Cutaway punchline. Multi-cut justified by the doc reveal.

---

### Example D — Lifestyle POV (after-work decompression)

**Brief.** Lifestyle, wistful, single-shot.

**POV line.** `POV: coming home after a 2-hour customer call that should've been an email.`

**Persona.** Late twenties to thirties, business-casual, walking through an apartment door.

**Beat 1 (0-2s).**
> Hallway / entryway POV — character pushes through a door, drops a bag on the floor, walks past camera into a kitchen. Late evening warm light. As they pass, eyes flick to camera for half a second. Centered text overlay: `POV: coming home after a 2-hour customer call that should've been an email.`

**Beat 2+3 combined (2-15s, single continuous i2v).**
> Same character, kitchen, same warm low light. Stands at the counter, doesn't take off coat. Stares at the cabinet for 3 seconds. Opens it. Pulls out a single chocolate bar. Closes the cabinet. Stares at the wall. Slowly unwraps the chocolate. Takes one bite. Closes eyes. Holds.

**VO.** None. Soft melancholic instrumental bed (ElevenLabs Music — "soft indie, piano, 70 BPM, gently melancholic, no vocals").

**Captions.** None — no spoken line.

**Payoff style.** Emotional peak / wistful hold. The closed-eyes chocolate bite is the payoff.

---

## Negative prompt

> "no studio lighting, no model-look, no plastic skin, no over-acting, no exaggerated facial expressions, no cartoon-eyes, no lipsync drift, no fake brand, no AI-improvised text in frame (POV overlay is added in post), no multiple characters unless explicitly described, no zoom-in unless described."

## Final assembly note

The POV text overlay is added in **Remotion post-render**, NOT in the i2v generation. Generate clean clips without text in frame (use the negative prompt above to enforce). Add the overlay as a `<AbsoluteFill>` + custom-text component in the composition. This way the overlay is sharp (vector text), correctly sized for the safe-area, and editable without re-generating video.
